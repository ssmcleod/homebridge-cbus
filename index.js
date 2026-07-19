'use strict';

require('./hot-debug.js');
const debug = require('debug')('cbus:platform');
const logLevel = require('debug')('cbus:level');
const logClient = require('debug')('cbus:client');

const chalk = require('chalk');

const CGateClient = require('./lib/cgate-client.js');
const CGateDatabase = require('./lib/cgate-database.js');
const CGateExport = require('./lib/cgate-export.js');

const CBusNetId = require('./lib/cbus-netid.js');
const CBusAccessory = require('./accessories/accessory.js');

const PLUGIN_NAME = 'homebridge-cbus';
const PLATFORM_NAME = 'CBus';

// maps config.json accessory 'type' values to their implementation class
const ACCESSORY_TYPES = {
	light: require('./accessories/light-accessory.js'),
	dimmer: require('./accessories/dimmer-accessory.js'),
	motion: require('./accessories/motion-accessory.js'),
	security: require('./accessories/security-accessory.js'),
	shutter: require('./accessories/shutter-accessory.js'),
	fan: require('./accessories/fan-accessory.js'),
	switch: require('./accessories/switch-accessory.js'),
	trigger: require('./accessories/trigger-accessory.js'),
	smoke: require('./accessories/smoke-sensor-accessory.js'),
	contact: require('./accessories/contact-accessory.js'),
	temperature: require('./accessories/temperature-accessory.js'),
};

// ==========================================================================================
// Exports block
// ==========================================================================================

module.exports = (api) => {
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, CBusPlatform);
};

// ==========================================================================================
// CBusPlatform
// ==========================================================================================
//
// This is a homebridge "dynamic platform": accessories are wrapped in a homebridge
// PlatformAccessory, cached to disk between restarts, and registered/unregistered via
// api.registerPlatformAccessories()/unregisterPlatformAccessories(). This replaces the old
// "static platform" accessories(callback) style, which Homebridge's modern versions have
// moved away from, and which required each accessory to directly subclass hap-nodejs's
// Accessory class -- something that no longer works now that Accessory is a real ES6 class.

class CBusPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config || {};
		this.api = api;
		this.hap = api.hap;

		// PlatformAccessory instances restored from homebridge's on-disk cache, keyed by UUID.
		// Populated by configureAccessory() before didFinishLaunching fires.
		this.cachedAccessories = new Map();

		// our accessory wrapper instances, keyed by netId string, so incoming C-Gate events
		// can be routed to the right accessory
		this.registeredAccessories = {};

		if (typeof this.config.client_ip_address === `undefined`) {
			this.log.error(`client_ip_address missing from config; CBus platform disabled.`);
			return;
		}
		this.cgateIpAddress = this.config.client_ip_address;
		this.cgateControlPort = (typeof this.config.client_controlport === `undefined`)
			? undefined : this.config.client_controlport;

		try {
			this.project = CBusNetId.validatedProjectName(this.config.client_cbusname);
		} catch (err) {
			this.log.error(`illegal client_cbusname: ${this.config.client_cbusname}; CBus platform disabled.`);
			return;
		}

		this.network = (typeof this.config.client_network === `undefined`) ? undefined : this.config.client_network;
		this.application = (typeof this.config.client_application === `undefined`) ? undefined : this.config.client_application;

		// if set, client_debug overrides the setting in the environment
		if (typeof this.config.client_debug !== `undefined`) {
			logClient.enable(this.config.client_debug);
		}

		this.api.on('didFinishLaunching', () => this._didFinishLaunching());
	}

	// called once per cached accessory restored from homebridge's storage, before didFinishLaunching
	configureAccessory(platformAccessory) {
		debug(`Restoring cached accessory '${platformAccessory.displayName}'`);
		this.cachedAccessories.set(platformAccessory.UUID, platformAccessory);
	}

	_didFinishLaunching() {
		// initiate the CBus client
		this.client = new CGateClient(this.cgateIpAddress, this.cgateControlPort,
			this.project, this.network, this.application,
			this.clientDebug);

		this.database = new CGateDatabase(new CBusNetId(this.project));

		// listen for data from the client and ensure that the homebridge UI is updated
		this.client.on(`event`, message => this._processEvent(message));

		this.client.connect(() => {
			this.database.fetch(this.client, () => {
				const stats = this.database.getStats();
				debug(`Successfully fetched ${stats.numApplications} applications, ${stats.numGroups} groups and ${stats.numUnits} units from C-Gate.`);

				if (this.config.platform_export) {
					new CGateExport(this.database).exportPlatform(this.config.platform_export, this);
				}

				if (this.config.database_export) {
					new CGateExport(this.database).exportDatabase(this.config.database_export);
				}
			});

			this._configureAccessories();
		});
	}

	_processEvent(message) {
		if (message.netId) {
			let output;
			// lookup accessory
			const accessory = this.registeredAccessories[message.netId.toString()];
			if (!message.application === 'measurement') {
				const tag = this.database ? this.database.getTag(message.netId) : `NYI`;
				if (accessory) {
					output = `${chalk.red.bold(accessory.name)} (${accessory.type}) set to level ${message.level}%`;
				} else {
					output = `${chalk.red.bold.italic(tag)} (not-registered) set to level ${message.level}%`;
				}
			}

			// append source info, if applicable
			if (message.sourceUnit) {
				const sourceId = new CBusNetId(this.project, this.network, `p`, message.sourceUnit);
				const source = this.database.getNetworkEntity(sourceId);
				if (typeof source === `undefined`) {
					debug(`event source unit ${sourceId} not found.`);
				} else {
					output = `${output}, by ${chalk.red.bold(source.tag)} (${source.unitType})`;
				}
			}
			logLevel(output);

			if (accessory) {
				// process if found
				// 702 code for temperature measurement event
				const err = (message.code !== 730 && !message.code === 702);
				accessory.processClientData(err, message);
			}
		} else if (message.code === 700) {
			debug(`Heartbeat @ ${message.time}`);
		} else if (message.code === 751) {
			debug(`Tag information changed.`);
		}
	}

	// build/reconcile accessories against config.json, reusing cached PlatformAccessories
	// where possible, and registering/unregistering with homebridge as needed
	_configureAccessories() {
		if (typeof this.config.accessories === `undefined`) {
			this.log.error(`Your config.json file is missing the 'accessories' section for this platform. (Check spelling!)`);
			return;
		}

		const seenUUIDs = new Set();
		const newPlatformAccessories = [];

		for (const accessoryConfig of this.config.accessories) {
			if (accessoryConfig.enabled === false) {
				debug(`Skipping disabled accessory '${accessoryConfig.name}' (${accessoryConfig.type})`);
				continue;
			}

			const Constructor = ACCESSORY_TYPES[accessoryConfig.type];
			if (!Constructor) {
				this.log.error(`unknown accessory type '${accessoryConfig.type}' for '${accessoryConfig.name}'; skipping`);
				continue;
			}

			let wrapper;
			try {
				const uuid = CBusAccessory.uuidFor(this, accessoryConfig);
				const existing = this.cachedAccessories.get(uuid);

				wrapper = new Constructor(this, accessoryConfig, existing);

				if (!existing) {
					newPlatformAccessories.push(wrapper.platformAccessory);
				}
				seenUUIDs.add(wrapper.platformAccessory.UUID);
			} catch (err) {
				this.log.error(`Unable to instantiate accessory '${accessoryConfig.name}' (${accessoryConfig.type}): ${err.message}`);
				continue;
			}

			this.registeredAccessories[wrapper.netId.toString()] = wrapper;
		}

		if (newPlatformAccessories.length > 0) {
			debug(`Registering ${newPlatformAccessories.length} new accessories…`);
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newPlatformAccessories);
		}

		// remove any cached accessories that are no longer present in config.json
		const staleAccessories = [...this.cachedAccessories.values()].filter(pa => !seenUUIDs.has(pa.UUID));
		if (staleAccessories.length > 0) {
			debug(`Removing ${staleAccessories.length} stale cached accessories…`);
			this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
		}

		debug(`Registered ${seenUUIDs.size} accessories in total.`);
	}
}

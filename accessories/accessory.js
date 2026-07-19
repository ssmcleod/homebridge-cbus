'use strict';

const debug = require('debug')('cbus:accessory');
const chalk = require('chalk');

const cbusUtils = require('../lib/cbus-utils.js');
const CBusNetId = require('../lib/cbus-netid.js');

// Base class for all CBus accessory types. Wraps a homebridge PlatformAccessory
// (composition) rather than subclassing hap-nodejs's Accessory -- hap-nodejs's
// Accessory is a real ES6 class these days and can't be extended via
// Accessory.call(this, ...) the way older versions of this plugin did.
class CBusAccessory {
	// computes the CBusNetId for a config entry; shared by the platform (to look up
	// a cached PlatformAccessory by uuid before construction) and the constructor below
	static netIdFor(platform, accessoryData) {
		let groupAddress;
		try {
			groupAddress = cbusUtils.integerise(accessoryData.id);
		} catch (err) {
			throw new Error(`id '${accessoryData.id}' for accessory '${accessoryData.name}' is not an integer`);
		}

		return new CBusNetId(
			platform.project,
			accessoryData.network || platform.client.network,
			accessoryData.application || platform.client.application,
			groupAddress,
			accessoryData.channel
		);
	}

	static uuidFor(platform, accessoryData) {
		const netId = CBusAccessory.netIdFor(platform, accessoryData);
		return platform.api.hap.uuid.generate(netId.getHash());
	}

	constructor(platform, accessoryData, existingPlatformAccessory) {
		console.assert(typeof accessoryData.type !== `undefined`, `accessoryData.type must not be undefined`);

		this.platform = platform;
		this.api = platform.api;
		this.hap = platform.api.hap;
		this.client = platform.client;
		this.accessoryData = accessoryData;
		this.type = accessoryData.type;

		if (typeof accessoryData.name !== `string`) {
			throw new Error(`missing required 'name' field`);
		}
		this.name = accessoryData.name;

		if (typeof accessoryData.id === `undefined`) {
			throw new Error(`accessory '${this.name}' missing required 'id' (group address) field`);
		}

		this.netId = CBusAccessory.netIdFor(platform, accessoryData);

		const uuid = this.hap.uuid.generate(this.netId.getHash());
		this.platformAccessory = existingPlatformAccessory || new this.api.platformAccessory(this.name, uuid);
		this.platformAccessory.displayName = this.name;
		this.platformAccessory.context.netId = this.netId.toString();

		const infoService = this.getService(this.hap.Service.AccessoryInformation) ||
			this.addService(this.hap.Service.AccessoryInformation);

		infoService.setCharacteristic(this.hap.Characteristic.Manufacturer, `Clipsal C-Bus`);
		infoService.setCharacteristic(this.hap.Characteristic.SerialNumber, this.netId.toString());
		infoService.setCharacteristic(this.hap.Characteristic.Model, this.type);
	}

	addService(...args) {
		return this.platformAccessory.addService(...args);
	}

	getService(...args) {
		return this.platformAccessory.getService(...args);
	}

	_log(file, action, message) {
		const fileName = file.split(`-`)[0];
		const accessoryLabel = cbusUtils.formatTag(this.name, this.netId);
		debug(`${chalk.gray.bold(fileName)} ${accessoryLabel} ${chalk.red(action)} ${message}`);
	}
}

module.exports = CBusAccessory;

'use strict';

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusTriggerAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		try {
			this.action = cbusUtils.integerise(accessoryData.action);
		} catch (err) {
			throw new Error(`action value '${accessoryData.action}' for accessory '${this.name}' is not an integer`);
		}

		// register the on-off service
		this.service = this.getService(this.hap.Service.Switch) ||
			this.addService(this.hap.Service.Switch, this.name);

		this.onCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.On);
		this.onCharacteristic.onSet(this.setTrigger.bind(this));
	}

	async setTrigger(trigger) {
		console.assert((trigger === 1) || (trigger === 0) || (trigger === true) || (trigger === false));

		if (trigger) {
			await new Promise(resolve => this.client.triggerAction(this.netId, this.action, resolve));
			this.timeout = setTimeout(() => {
				this.onCharacteristic.updateValue(false);
			}, 500);
		}
	}

	processClientData(err, message) {
		if (!err) {
			console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
		}
	}
}

module.exports = CBusTriggerAccessory;

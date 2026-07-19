'use strict';

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusLightAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// keep track of state
		this.isOn = false;
		this.brightness = 100;
		this.rampDuration = 0; // duration in ms

		// register on-off service
		this.service = this.getService(this.hap.Service.Lightbulb) ||
			this.addService(this.hap.Service.Lightbulb, this.name);

		this.onCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.On);

		this.onCharacteristic
			.onGet(this.getOn.bind(this))
			.onSet(this.setOn.bind(this));
	}

	async getOn() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve, `getOn`));
		this.isOn = message.level > 0;
		this._log(FILE_ID, `getOn`, `receiveLevel returned ${message.level}`);
		return this.isOn;
	}

	async setOn(turnOn) {
		// delay by a fraction of a second to give any subclass (nb. there may not be one) a chance to work first
		await cbusUtils.delay(50);

		console.assert((turnOn === 1) || (turnOn === 0) || (turnOn === true) || (turnOn === false));
		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (this.isOn === wasOn) {
			this._log(FILE_ID, `setOn`, `no state change from ${wasOn}`);
			return;
		}

		const newLevel = turnOn ? this.brightness : 0;
		const reasonExtension = turnOn ? ((this.brightness === 100) ? `on` : `restore`) : `off`;

		this._log(FILE_ID, `setOn`, `changing level to ${newLevel}%`);
		await new Promise(resolve => this.client.setLevel(
			this.netId, newLevel, resolve, this.rampDuration / 1000, `setOn (${reasonExtension})`));
	}

	// received an event over the network -- could have been in response to one of our
	// commands, or someone else. updateValue() pushes the new state to HomeKit without
	// re-triggering setOn(), so there's no need for the old context==='event' loop guard.
	processClientData(err, message) {
		if (!err) {
			console.assert(typeof message.level !== `undefined`, `message.level must not be undefined`);
			this.onCharacteristic.updateValue(message.level > 0);
		}
	}
}

module.exports = CBusLightAccessory;

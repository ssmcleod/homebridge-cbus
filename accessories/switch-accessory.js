'use strict';

const ms = require('ms');

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusSwitchAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// if we have an activeDuration specified, stash it away
		if (typeof accessoryData.activeDuration !== `undefined`) {
			this.activeDuration = ms(accessoryData.activeDuration);
			this._log(FILE_ID, `construct`, `automatically turn off ${this.activeDuration}ms when activated via homebridge`);
		}

		this.isOn = false;

		// register the on-off service
		this.service = this.getService(this.hap.Service.Switch) ||
			this.addService(this.hap.Service.Switch, this.name);

		this.onCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.On);
		this.onCharacteristic
			.onGet(this.getOn.bind(this))
			.onSet(this.setOn.bind(this));
	}

	async getOn() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve, `getOn`));
		this.isOn = message.level > 0;
		this._log(FILE_ID, `getOn`, `status = '${this.isOn ? `on` : `off`}'`);
		return this.isOn;
	}

	async setOn(turnOn) {
		if (this.timeout) {
			this._log(FILE_ID, `setOn`, `clearing activity timer`);
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}

		console.assert((turnOn === 1) || (turnOn === 0) || (turnOn === true) || (turnOn === false));
		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (wasOn === this.isOn) {
			this._log(FILE_ID, `setOn`, `no state change from ${turnOn}`);
			return;
		}

		if (this.isOn) {
			this._log(FILE_ID, `setOn(true)`, `changing to 'on'`);
			await new Promise(resolve => this.client.turnOn(this.netId, resolve));

			if (this.activeDuration) {
				this.timeout = setTimeout(() => {
					this._log(FILE_ID, `activity timer expired`, `turning off`);
					this.isOn = false;
					this.onCharacteristic.updateValue(false);
					this.client.turnOff(this.netId);
				}, this.activeDuration);
				this._log(FILE_ID, `activity timer activated`, `will turn off in ${ms(this.activeDuration)} (${this.activeDuration}ms)`);
			}
		} else {
			this._log(FILE_ID, `setOn(false)`, `changing to 'off'`);
			await new Promise(resolve => this.client.turnOff(this.netId, resolve));
		}
	}

	processClientData(err, message) {
		if (!err) {
			console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
			this.onCharacteristic.updateValue(message.level > 0);
		}
	}
}

module.exports = CBusSwitchAccessory;

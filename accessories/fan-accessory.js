'use strict';

const chalk = require('chalk');

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusFanAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// register the service
		this.service = this.getService(this.hap.Service.Fan) ||
			this.addService(this.hap.Service.Fan, this.name);

		this.onCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.On);
		this.speedCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.RotationSpeed);

		this.onCharacteristic
			.onGet(this.getOn.bind(this))
			.onSet(this.setOn.bind(this));

		// the current fan speed (0-100%)
		this.speedCharacteristic
			.onGet(this.getSpeed.bind(this))
			.onSet(this.setSpeed.bind(this));

		// prime the fan state
		this.isOn = false;
		this.speed = 0;

		// it seems that the Home app kicks off an update only when activating the app,
		// but not automatically if homekit is restarted.
		setTimeout(async () => {
			this._log(FILE_ID, `construct`, `prime state`);
			try {
				const speed = await this.getSpeed();
				this.isOn = speed > 0;
				this.speed = speed;

				this.onCharacteristic.updateValue(this.isOn);
				this.speedCharacteristic.updateValue(this.speed);
			} catch (err) {
				this._log(FILE_ID, `construct`, `failed to prime state: ${err}`);
			}
		}, 3000);
	}

	async getOn() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve, `getOn`));
		this._log(FILE_ID, `getOn receiveLevel returned ${message.level}%`);
		this.isOn = message.level > 0;
		if (this.isOn) {
			this.speed = message.level;
		}

		return this.isOn;
	}

	async setOn(turnOn) {
		// delay by a fraction of a second to give setSpeed a chance to work first
		await cbusUtils.delay(50);

		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (wasOn === this.isOn) {
			this._log(FILE_ID, `setOn`, `no state change from ${wasOn}`);
			return;
		}

		const speed = this.isOn ? this.speed : 0;

		if (this.isOn && speed === 0) {
			this._log(FILE_ID, `setOn`, chalk.green.bold(`swallowing on with speed 0`));
			return;
		}

		this._log(FILE_ID, `setOn`, `changing level to ${speed}%`);
		await new Promise(resolve => this.client.setLevel(this.netId, speed, resolve, 0, `setOn`));
	}

	async getSpeed() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve, `getSpeed`));
		const speed = message.level;
		this._log(FILE_ID, `getSpeed`, `receiveLevel returned ${speed}%`);
		this.isOn = speed > 0;

		if (speed > 0) {
			// update speed if the speed is non-zero
			this.speed = speed;
		}

		return this.speed;
	}

	async setSpeed(newSpeed) {
		this.speed = newSpeed;
		const wasOn = this.isOn;
		this.isOn = newSpeed > 0;

		if (!wasOn && (newSpeed === 0)) {
			this._log(FILE_ID, `setSpeed`, chalk.green(`swallowing 0%`));
			return;
		}

		this._log(FILE_ID, `setSpeed`, `changing speed to ${newSpeed}%`);
		await new Promise(resolve => this.client.setLevel(this.netId, newSpeed, resolve, 0, `setSpeed`));
	}

	// received an event over the network -- could have been in response to one of our commands, or someone else
	processClientData(err, message) {
		if (!err) {
			console.assert(typeof message.level !== `undefined`, `CBusFanAccessory.processClientData must receive message.level`);
			const speed = message.level;

			// update isOn
			this.onCharacteristic.updateValue(speed > 0);

			// update speed
			if (speed === 0) {
				this._log(FILE_ID, `processClientData`, `speed 0%; interpreting as 'off'`);
			} else {
				this.speedCharacteristic.updateValue(speed);
			}
		}
	}
}

module.exports = CBusFanAccessory;

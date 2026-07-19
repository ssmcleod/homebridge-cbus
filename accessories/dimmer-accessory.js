'use strict';

const chalk = require('chalk');
const ms = require('ms');

const CBusLightAccessory = require('./light-accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusDimmerAccessory extends CBusLightAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// if we have an activeDuration specified, stash it away
		if (typeof accessoryData.rampDuration !== `undefined`) {
			this.rampDuration = ms(accessoryData.rampDuration);
			if (this.rampDuration > ms(`17m`)) {
				throw new Error(`accessory '${this.name}' rampDuration (${ms(this.rampDuration)}) is greater than maximum (17m)`);
			}
			this._log(FILE_ID, `constructed`, `ramp up/down over ${this.rampDuration}ms when activated via homebridge`);
		}

		// register brightness service
		this.brightnessCharacteristic = this.service.getCharacteristic(this.hap.Characteristic.Brightness);

		this.brightnessCharacteristic
			.onGet(this.getBrightness.bind(this))
			.onSet(this.setBrightness.bind(this));
	}

	async getBrightness() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve, `getBrightness`));
		this._log(FILE_ID, `getBrightness`, `returned ${message.level}%`);

		if (message.level) {
			// update level if the level is non-zero
			this.brightness = message.level;
		}

		return message.level;
	}

	async setBrightness(newLevel) {
		this.brightness = newLevel;
		const wasOn = this.isOn;
		this.isOn = this.brightness > 0;

		if (!wasOn && (newLevel === 0)) {
			this._log(FILE_ID, `setBrightness`, chalk.green(`swallowing 0%`));
			return;
		}

		this._log(FILE_ID, `setBrightness`, `changing level to ${newLevel}%`);
		await new Promise(resolve => this.client.setLevel(this.netId, newLevel, resolve, this.rampDuration / 1000, `setBrightness`));
	}

	processClientData(err, message) {
		if (!err) {
			console.assert(typeof message.level !== `undefined`, `CBusDimmerAccessory.processClientData must receive message.level`);
			const level = message.level;

			// pick up the special cases of 'on' and 'off'
			this.onCharacteristic.updateValue(level > 0);

			// update brightness
			if (level === 0) {
				this._log(FILE_ID, `processClientData`, `level 0%; interpreting as 'off'`);
			} else {
				this.brightnessCharacteristic.updateValue(level);
			}
		}
	}
}

module.exports = CBusDimmerAccessory;

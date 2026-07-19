'use strict';

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusTemperatureAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// register temperature service
		this.service = this.getService(this.hap.Service.TemperatureSensor) ||
			this.addService(this.hap.Service.TemperatureSensor, this.name);
	}

	processClientData(err, message) {
		const currentTemp = message.remainder &&
			message.remainder.length >= 4 &&
			Number(message.remainder[1]) * Math.pow(10, Number(message.remainder[2]));
		const temperatureDisplayUnits = message.remainder &&
			message.remainder.length >= 4 &&
			Number(message.remainder[3]);

		if (!err) {
			this._log(FILE_ID, `${message.application} event`, currentTemp);
			this.service.getCharacteristic(this.hap.Characteristic.CurrentTemperature)
				.updateValue(currentTemp);
			this.service.getCharacteristic(this.hap.Characteristic.TemperatureDisplayUnits)
				.updateValue(temperatureDisplayUnits);
		}
	}
}

module.exports = CBusTemperatureAccessory;

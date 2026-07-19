'use strict';

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusMotionAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// register on-off service
		this.service = this.getService(this.hap.Service.MotionSensor) ||
			this.addService(this.hap.Service.MotionSensor, this.name);

		this.service.getCharacteristic(this.hap.Characteristic.MotionDetected)
			.onGet(this.getMotionState.bind(this));
	}

	async getMotionState() {
		const message = await new Promise(resolve => this.client.receiveLevel(this.netId, resolve));
		this._log(FILE_ID, `getState`, message.level);
		return message.level > 0;
	}

	processClientData(err, message) {
		if (!err) {
			this.service.getCharacteristic(this.hap.Characteristic.MotionDetected)
				.updateValue(message.level > 0);
		}
	}
}

module.exports = CBusMotionAccessory;

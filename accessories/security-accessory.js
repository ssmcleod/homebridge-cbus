'use strict';

const CBusAccessory = require('./accessory.js');
const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

class CBusSecurityAccessory extends CBusAccessory {
	constructor(platform, accessoryData, existingPlatformAccessory) {
		super(platform, accessoryData, existingPlatformAccessory);

		// register the on-off service
		this.service = this.getService(this.hap.Service.MotionSensor) ||
			this.addService(this.hap.Service.MotionSensor, this.name);

		this.service.getCharacteristic(this.hap.Characteristic.MotionDetected)
			.onGet(this.getMotionState.bind(this));
	}

	async getMotionState() {
		const message = await new Promise(resolve => this.client.receiveSecurityStatus(this.netId, resolve));
		let detected;
		if (['zone_unsealed', 'zone_open', 'zone_short'].includes(message.zonestate)) {
			detected = true;
		} else if (message.zonestate === 'zone_sealed') {
			detected = false;
		}

		this._log(FILE_ID, `getMotionState`, `${message.zonestate} => ${detected}`);
		return detected;
	}

	processClientData(err, message) {
		if (!err) {
			this.service.getCharacteristic(this.hap.Characteristic.MotionDetected)
				.updateValue(message.level > 0);
		}
	}
}

module.exports = CBusSecurityAccessory;

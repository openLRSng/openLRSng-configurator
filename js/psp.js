'use strict';

const PSP_SYNC1 = 0xB5;
const PSP_SYNC2 = 0x62;

const PSP_REQ_BIND_DATA =               1;
const PSP_REQ_RX_CONFIG =               2;
const PSP_REQ_RX_JOIN_CONFIGURATION =   3;
const PSP_REQ_SCANNER_MODE =            4;
const PSP_REQ_SPECIAL_PINS =            5;
const PSP_REQ_FW_VERSION =              6;
const PSP_REQ_NUMBER_OF_RX_OUTPUTS =    7;
const PSP_REQ_ACTIVE_PROFILE =          8;
const PSP_REQ_RX_FAILSAFE =             9;
const PSP_REQ_TX_CONFIG =               10;
const PSP_REQ_PPM_IN =                  11;
const PSP_REQ_DEFAULT_PROFILE =         12;

const PSP_SET_BIND_DATA =               101;
const PSP_SET_RX_CONFIG =               102;
const PSP_SET_TX_SAVE_EEPROM =          103;
const PSP_SET_RX_SAVE_EEPROM =          104;
const PSP_SET_TX_RESTORE_DEFAULT =      105;
const PSP_SET_RX_RESTORE_DEFAULT =      106;
const PSP_SET_ACTIVE_PROFILE =          107;
const PSP_SET_RX_FAILSAFE =             108;
const PSP_SET_TX_CONFIG =               109;
const PSP_SET_DEFAULT_PROFILE =         110;

const PSP_SET_EXIT =                    199;

const PSP_INF_ACK =                     201;
const PSP_INF_REFUSED =                 202;
const PSP_INF_CRC_FAIL =                203;
const PSP_INF_DATA_TOO_LONG =           204;

var PSP = {
    state:                  0,
    code:                   0,
    crc:                    0,
    payloadLengthExpected:  0,
    payloadLengthReceived:  0,
    buffer:                 null,
    bufferUint8:            null,
    retryCounter:           0,

    scrapsBuffer:           '',
    callbacks:              [],
    data:                   [],

    callbacks_cleanup: function () {
        for (var i = 0; i < this.callbacks.length; i++) {
            clearTimeout(this.callbacks[i].timer);
        }

        this.callbacks = [];
    },

    disconnect_cleanup: function () {
        this.state = 0; // reset packet state for "clean" initial entry (this is only required if user hot-disconnects)
        this.scrapsBuffer = '';
        this.retryCounter = 0;
        this.callbacks_cleanup();
        this.data = [];
    }
};

PSP.read = function (readInfo) {
    var data = new Uint8Array(readInfo.data);

    for (var i = 0; i < data.length; i++) {
        if (this.state == 0 || this.state == 1) {
            if (data[i] != 10) {
                this.scrapsBuffer += String.fromCharCode(data[i]);
            } else { // LF
                console.log('ASCII scraps: ' + this.scrapsBuffer);

                // clean up
                this.scrapsBuffer = '';
            }
        }

        switch (this.state) {
            case 0:
                if (data[i] == PSP_SYNC1) {
                    this.state++;
                }
                break;
            case 1:
                if (data[i] == PSP_SYNC2) {
                    this.state++;
                } else {
                    this.state = 0; // Restart and try again
                }
                break;
            case 2:
                this.code = data[i];
                this.crc = data[i];

                // this is a valid message, clean up scraps buffer
                this.scrapsBuffer = '';

                this.state++;
                break;
            case 3: // payload length LSB
                this.payloadLengthExpected = data[i];
                this.crc ^= data[i];

                this.state++;
                break;
            case 4: // payload length MSB
                this.payloadLengthExpected |= data[i] << 8;
                this.crc ^= data[i];

                // setup arraybuffer
                this.buffer = new ArrayBuffer(this.payloadLengthExpected);
                this.bufferUint8 = new Uint8Array(this.buffer);

                if (this.payloadLengthExpected) { // regular message with payload
                    this.state++;
                } else { // 0 payload message
                    this.state += 2;
                }
                break;
            case 5: // payload
                this.bufferUint8[this.payloadLengthReceived++] = data[i];
                this.crc ^= data[i];

                if (this.payloadLengthReceived >= this.payloadLengthExpected) {
                    this.state++;
                }
                break;
            case 6:
                if (this.crc == data[i]) {
                    if (this.data[this.code]) {
                        this.data[this.code]['_packet'] = this.buffer;
                    } else {
                        this.data[this.code] = {_packet: this.buffer, _map: {}};
                    }

                    this.retryCounter = 0;

                    // message received, process
                    this.process_data(this.code, this.data[this.code]);
                } else {
                    // crc failed
                    console.log('crc failed, code: ' + this.code);

                    // retry
                    if (this.retryCounter < 3) {
                        for (var i = this.callbacks.length - 1; i >= 0; i--) {
                            if (this.callbacks[i].code == this.code) {
                                this.retryCounter++;
                                serial.send(this.callbacks[i].requestBuffer, false);
                                break;
                            }
                        }
                    } else {
                        GUI.log(chrome.i18n.getMessage('error_psp_crc_failed', [this.code]));

                        // unlock disconnect button (this is a special case)
                        GUI.connect_lock = false;
                    }
                }

                // Reset variables
                this.payloadLengthReceived = 0;
                this.state = 0;
                break;

            default:
                console.log('Unknown state detected: ' + this.state);
        }
    }
};

PSP.process_data = function (code, obj) {
    var data = new DataView(obj._packet, 0); // DataView (allowing us to view arrayBuffer as struct/union)
    var offset = 0;

    function get(name, type) {
        // all values are treated as littleEndian
        if (!obj._map.hasOwnProperty(name)) {
            obj._map[name] = {
                'offset':   offset,
                'type':     type
            };
        }

        switch (type) {
            case 'u8':
                obj[name] = data.getUint8(offset, 1);
                offset += 1;
                break;
            case '8':
                obj[name] = data.getInt8(offset, 1);
                offset += 1;
                break;
            case 'u16':
                obj[name] = data.getUint16(offset, 1);
                offset += 2;
                break;
            case '16':
                obj[name] = data.getInt16(offset, 1);
                offset += 2;
                break;
            case 'u32':
                obj[name] = data.getUint32(offset, 1);
                offset += 4;
                break;
            case '32':
                obj[name] = data.getInt32(offset, 1);
                offset += 4;
                break;
            case 'f32':
                obj[name] = data.getFloat32(offset, 1);
                offset += 4;
                break;
            case 'f64':
                obj[name] = data.getFloat64(offset, 1);
                offset += 8;
                break;

            default:
                console.error('Unrecognized variable type: ' + type);
        }
    }

    function getArray(name, type, arrayLength) {
        // all values are treated as littleEndian
        if (!obj._map.hasOwnProperty(name)) {
            obj._map[name] = {
                'offset':       offset,
                'type':         type,
                'arrayLength':  arrayLength
            };
        }

        obj[name] = [];

        for (var i = 0; i < arrayLength; i++) {
            switch (type) {
                case 'u8':
                    obj[name][i] = data.getUint8(offset, 1);
                    offset += 1;
                    break;
                case '8':
                    obj[name][i] = data.getInt8(offset, 1);
                    offset += 1;
                    break;
                case 'u16':
                    obj[name][i] = data.getUint16(offset, 1);
                    offset += 2;
                    break;
                case '16':
                    obj[name][i] = data.getInt16(offset, 1);
                    offset += 2;
                    break;
                case 'u32':
                    obj[name][i] = data.getUint32(offset, 1);
                    offset += 4;
                    break;
                case '32':
                    obj[name][i] = data.getInt32(offset, 1);
                    offset += 4;
                    break;
                case 'f32':
                    obj[name][i] = data.getFloat32(offset, 1);
                    offset += 4;
                    break;
                case 'f64':
                    obj[name][i] = data.getFloat64(offset, 1);
                    offset += 8;
                    break;

                default:
                    console.error('Unrecognized variable type: ' + type);
            }
        }
    }

    switch (code) {
        case PSP_REQ_BIND_DATA:
            get('version', 'u8');
            get('serial_baudrate', 'u32');
            get('rf_frequency', 'u32');
            get('rf_magic', 'u32');
            get('rf_power', 'u8');
            get('rf_channel_spacing', 'u8');
            getArray('hopchannel', 'u8', 24);
            get('modem_params', 'u8');
            get('flags', 'u8');

            GUI.log(chrome.i18n.getMessage('bind_data_received'));
            break;
        case PSP_REQ_RX_CONFIG:
            get('rx_type', 'u8');
            getArray('pinMapping', 'u8', 13);
            get('flags', 'u8');
            get('RSSIpwm', 'u8');
            get('beacon_frequency', 'u32');
            get('beacon_deadtime', 'u8');
            get('beacon_interval', 'u8');
            get('minsync', 'u16');
            get('failsafe_delay', 'u8');
            get('ppmStopDelay', 'u8');
            get('pwmStopDelay', 'u8');

            GUI.log(chrome.i18n.getMessage('receiver_config_data_received'));
            break;
        case PSP_REQ_RX_JOIN_CONFIGURATION:
            break;
        case PSP_REQ_SCANNER_MODE:
            break;
        case PSP_REQ_SPECIAL_PINS:
            obj.pins = [];

            for (var i = 0; i < data.byteLength; i += 2) {
                var object = {'pin': data.getUint8(i), 'type': data.getUint8(i + 1)};
                obj.pins.push(object);
            }
            break;
        case PSP_REQ_FW_VERSION:
            // version number in single uint16 [8bit major][4bit][4bit] fetched from mcu
            get('firmwareVersion', 'u16');
            break;
        case PSP_REQ_NUMBER_OF_RX_OUTPUTS:
            get('outputs', 'u8');
            break;
        case PSP_REQ_ACTIVE_PROFILE:
            get('profile', 'u8');
            break;
        case PSP_REQ_RX_FAILSAFE:
            obj.values = [];

            if (data.byteLength > 1) { // valid failsafe values received (big-endian), TODO change this to low endian after FW gets fixed
                for (var i = 0; i < data.byteLength; i += 2) {
                    obj.values.push(data.getUint16(i, 0));
                }

                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_received'));
            } else if (data.byteLength == 1) { // 0x01 = failsafe not set
                for (var i = 0; i < 16; i++) {
                    obj.values.push(1000);
                }

                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_not_saved_yet'));
            } else {
                // 0x00 = call failed
            }
            break;
        case PSP_REQ_TX_CONFIG:
            get('rfm_type', 'u8');
            get('max_frequency', 'u32');
            get('flags', 'u32');
            getArray('chmap', 'u8', 16);
            break;
        case PSP_REQ_PPM_IN:
            get('ppmAge', 'u8');
            getArray('channels', 'u16', (data.byteLength - 1) / 2);
            break;
        case PSP_REQ_DEFAULT_PROFILE:
            get('profile', 'u8');
            break;
        case PSP_SET_BIND_DATA:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('transmitter_bind_data_sent_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('transmitter_bind_data_sent_fail'));
            }
            break;
        case PSP_SET_RX_CONFIG:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_config_data_sent_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_config_data_sent_fail'));
            }
            break;
        case PSP_SET_TX_SAVE_EEPROM:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('transmitter_eeprom_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('transmitter_eeprom_save_fail'));
            }
            break;
        case PSP_SET_RX_SAVE_EEPROM:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_eeprom_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_eeprom_save_fail'));
            }
            break;
        case PSP_SET_TX_RESTORE_DEFAULT:
            GUI.log(chrome.i18n.getMessage('transmitter_configuration_restored'));
            break;
        case PSP_SET_RX_RESTORE_DEFAULT:
            GUI.log(chrome.i18n.getMessage('receiver_configuration_restored'));
            break;
        case PSP_SET_ACTIVE_PROFILE:
            break;
        case PSP_SET_RX_FAILSAFE:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_save_fail'));
            }
            break;
        case PSP_SET_TX_CONFIG:
            if (data.getUint8(0)) {
                console.log('TX configuration saved');
            } else {
                console.log('TX configuration not saved');
            }
            break;
        case PSP_SET_DEFAULT_PROFILE:
            break;
        case PSP_SET_EXIT:
            break;

        default:
            console.log('Unknown code: ' + code);
            GUI.log(chrome.i18n.getMessage('error_psp_unknown_code', [code]));
    }

    // trigger callbacks, cleanup/remove callback after trigger
    for (var i = this.callbacks.length - 1; i >= 0; i--) { // itterating in reverse because we use .splice which modifies array length
        if (this.callbacks[i].code == code) {
            // save callback reference
            var callback = this.callbacks[i].callback;

            // remove timeout
            if (this.callbacks[i].timeout) clearTimeout(this.callbacks[i].timer);

            // remove object from array
            this.callbacks.splice(i, 1);

            // fire callback
            if (callback) callback({'code': code, 'data': data, 'length': data.byteLength});
        }
    }
};

PSP.update_packet = function (code) {
    var obj = PSP.data[code];
    var packet = obj['_packet'];
    var data = new DataView(packet, 0);
    var map = obj['_map'];

    function set(offset, type, val) {
        switch (type) {
            case 'u8':
                data.setUint8(offset, val);
                break;
            case '8':
                data.setInt8(offset, val);
                break;
            case 'u16':
                data.setUint16(offset, val, 1);
                break;
            case '16':
                data.setInt16(offset, val, 1);
                break;
            case 'u32':
                data.setUint32(offset, val, 1);
                break;
            case '32':
                data.setInt32(offset, val, 1);
                break;
            case 'f32':
                data.setFloat32(offset, val, 1);
                break;
            case 'f64':
                data.setFloat64(offset, val, 1);
                break;

            default:
                console.error('Unrecognized variable type: ' + type);
        }
    }

    function setArray(offset, type, arr) {
        for (var i = 0; i < arr.length; i++) {
            var val = arr[i];

            switch (type) {
                case 'u8':
                    data.setUint8(offset, val);
                    offset += 1;
                    break;
                case '8':
                    data.setInt8(offset, val);
                    offset += 1;
                    break;
                case 'u16':
                    data.setUint16(offset, val, 1);
                    offset += 2;
                    break;
                case '16':
                    data.setInt16(offset, val, 1);
                    offset += 2;
                    break;
                case 'u32':
                    data.setUint32(offset, val, 1);
                    offset += 4;
                    break;
                case '32':
                    data.setInt32(offset, val, 1);
                    offset += 4;
                    break;
                case 'f32':
                    data.setFloat32(offset, val, 1);
                    offset += 4;
                    break;
                case 'f64':
                    data.setFloat64(offset, val, 1);
                    offset += 8;
                    break;

                default:
                    console.error('Unrecognized variable type: ' + type);
            }
        }
    }

    for (var property in map) {
        var name = property;
        var type = map[property]['type'];
        var offset = map[property]['offset'];
        var isArray = map[property].hasOwnProperty('arrayLength');

        if (!isArray) {
            set(offset, type, obj[name]);
        } else {
            setArray(offset, type, obj[name]);
        }
    }

    return new Uint8Array(packet);
};

PSP.send_message = function (code, data, callback_sent, callback_psp, timeout) {
    var self = this,
        bufferOut,
        bufView;

    // always reserve 6 bytes for protocol overhead !
    if (typeof data === 'object') {
        var size = data.length + 6,
            checksum = 0;

        bufferOut = new ArrayBuffer(size);
        bufView = new Uint8Array(bufferOut);

        bufView[0] = PSP_SYNC1;
        bufView[1] = PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = lowByte(data.length);
        bufView[4] = highByte(data.length);

        checksum = bufView[2] ^ bufView[3] ^ bufView[4];

        for (var i = 0; i < data.length; i++) {
            bufView[i + 5] = data[i];
            checksum ^= bufView[i + 5];
        }

        bufView[5 + data.length] = checksum;
    } else {
        bufferOut = new ArrayBuffer(7);
        bufView = new Uint8Array(bufferOut);

        bufView[0] = PSP_SYNC1;
        bufView[1] = PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = 0x01; // payload length LSB
        bufView[4] = 0x00; // payload length MSB
        bufView[5] = data;
        bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; // crc
    }

    // define PSP callback for next code
    if (callback_psp) {
        var obj;

        if (timeout) {
            obj = {'code': code, 'requestBuffer': bufferOut, 'callback': callback_psp, 'timeout': timeout};
            obj.timer = setTimeout(function() {
                // fire callback
                callback_psp(false);

                // remove object from array
                var index = self.callbacks.indexOf(obj);
                if (index > -1) self.callbacks.splice(index, 1);
            }, timeout);
        } else {
            obj = {'code': code, 'requestBuffer': bufferOut, 'callback': callback_psp, 'timeout': false};
        }

        this.callbacks.push(obj);
    }

    serial.send(bufferOut, function(writeInfo) {
        if (writeInfo.bytesSent == bufferOut.byteLength) {
            if (callback_sent) {
                callback_sent();
            }
        }
    });
};

PSP.send_config = function (type, callback) {
    if (CONFIGURATOR.readOnly) {
        GUI.log(chrome.i18n.getMessage('running_in_compatibility_mode'));

        return false;
    }

    if (type == 'TX') {
        function send_bind_data() {
            PSP.send_message(PSP_SET_BIND_DATA, PSP.update_packet(PSP_REQ_BIND_DATA), false, save_eeprom);
        }

        function save_eeprom() {
            PSP.send_message(PSP_SET_TX_SAVE_EEPROM, false, false, (callback) ? callback : undefined);
        }

        PSP.send_message(PSP_SET_TX_CONFIG, PSP.update_packet(PSP_REQ_TX_CONFIG), false, send_bind_data);

    } else if (type == 'RX') {
        function save_to_eeprom() {
            PSP.send_message(PSP_SET_RX_SAVE_EEPROM, false, false, (callback) ? callback : undefined);
        }

        PSP.send_message(PSP_SET_RX_CONFIG, PSP.update_packet(PSP_REQ_RX_CONFIG), false, save_to_eeprom);
    }
};
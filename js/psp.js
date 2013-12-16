var PSP = {
    PSP_SYNC1:        0xB5,
    PSP_SYNC2:        0x62,
    
    PSP_REQ_BIND_DATA:              1,
    PSP_REQ_RX_CONFIG:              2,
    PSP_REQ_RX_JOIN_CONFIGURATION:  3,
    PSP_REQ_SCANNER_MODE:           4,
    PSP_REQ_SPECIAL_PINS:           5,
    PSP_REQ_FW_VERSION:             6,
    PSP_REQ_NUMBER_OF_RX_OUTPUTS:   7,
    
    PSP_SET_BIND_DATA:          101,
    PSP_SET_RX_CONFIG:          102,
    PSP_SET_TX_SAVE_EEPROM:     103,
    PSP_SET_RX_SAVE_EEPROM:     104,
    PSP_SET_TX_RESTORE_DEFAULT: 105,
    PSP_SET_RX_RESTORE_DEFAULT: 106,
    PSP_SET_EXIT:               199,
    
    PSP_INF_ACK:           201,
    PSP_INF_REFUSED:       202,
    PSP_INF_CRC_FAIL:      203,
    PSP_INF_DATA_TOO_LONG: 204,
    
    callbacks: [],
    
    packet_state: 0,
    command: 0,
    message_crc: 0,
    message_length_expected: 0,
    message_length_received: 0,
    message_buffer: undefined,
    message_buffer_uint8_view: undefined
};

function PSP_char_read(readInfo) {
    if (readInfo && readInfo.bytesRead > 0) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            switch (PSP.packet_state) {
                case 0:
                    if (data[i] == PSP.PSP_SYNC1) {               
                        PSP.packet_state++;
                    }
                    break;
                case 1:
                    if (data[i] == PSP.PSP_SYNC2) {             
                        PSP.packet_state++;
                    } else {
                        PSP.packet_state = 0; // Restart and try again
                    }                    
                    break;
                case 2: // command
                    PSP.command = data[i];
                    PSP.message_crc = data[i];
                    
                    PSP.packet_state++;
                    
                    break;
                case 3: // payload length LSB
                    PSP.message_length_expected = data[i];
                    PSP.message_crc ^= data[i];
                    
                    PSP.packet_state++;
                    break;
                case 4: // payload length MSB
                    PSP.message_length_expected |= data[i] << 8;
                    PSP.message_crc ^= data[i];
                    
                    // setup arraybuffer
                    PSP.message_buffer = new ArrayBuffer(PSP.message_length_expected);
                    PSP.message_buffer_uint8_view = new Uint8Array(PSP.message_buffer);
                    
                    PSP.packet_state++;
                    break;
                case 5: // payload
                    PSP.message_buffer_uint8_view[PSP.message_length_received] = data[i];
                    PSP.message_crc ^= data[i];
                    PSP.message_length_received++;
                    
                    if (PSP.message_length_received >= PSP.message_length_expected) {
                        PSP.packet_state++;
                    }
                break;
                case 6:
                    if (PSP.message_crc == data[i]) {
                        // message received, process
                        process_data(PSP.command, PSP.message_buffer, PSP.message_length_expected);
                    } else {
                        // crc failed
                        if (debug) console.log('crc failed, command: ' + PSP.command);
                        
                        command_log('Transmission CRC check failed, re-connecting is advised');
                        
                        // unlock disconnect button (this is a special case)
                        GUI.connect_lock = false;
                    }   
                    
                    // Reset variables
                    PSP.message_length_received = 0;
                    
                    PSP.packet_state = 0;
                    break;
            }
        }
    }
}

function send_message(code, data, callback_sent, callback_psp) {
    var bufferOut;
    var bufView;
    
    // always reserve 6 bytes for protocol overhead !
    if (typeof data === 'object') {
        var size = data.length + 6;
        var checksum = 0;
        
        bufferOut = new ArrayBuffer(size);
        bufView = new Uint8Array(bufferOut); 

        bufView[0] = PSP.PSP_SYNC1;
        bufView[1] = PSP.PSP_SYNC2;
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
        
        bufView[0] = PSP.PSP_SYNC1;
        bufView[1] = PSP.PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = 0x01; // payload length LSB
        bufView[4] = 0x00; // payload length MSB
        bufView[5] = data;
        bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; // crc        
    }
    
    // define PSP callback for next command
    if (callback_psp) {
        PSP.callbacks.push({'code': code, 'callback': callback_psp});
    }
    
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
        if (writeInfo.bytesWritten > 0) {
            if (callback_sent) {
                callback_sent();
            }
        }
    });    
}

function process_data(command, message_buffer, message_length_expected) {
    var data = new DataView(message_buffer, 0); // DataView (allowing us to view arrayBuffer as struct/union)
    
    switch (command) {
        case PSP.PSP_REQ_BIND_DATA:
            BIND_DATA.version = data.getUint8(0);
            BIND_DATA.serial_baudrate = data.getUint32(1, 1);
            BIND_DATA.rf_frequency = data.getUint32(5, 1);
            BIND_DATA.rf_magic = data.getUint32(9, 1);
            BIND_DATA.rf_power = data.getUint8(13);
            BIND_DATA.rf_channel_spacing = data.getUint8(14);
            
            for (var i = 0; i < 24; i++) {
                BIND_DATA.hopchannel[i] =  data.getUint8(15 + i);
            }
            
            BIND_DATA.modem_params = data.getUint8(39);
            BIND_DATA.flags = data.getUint8(40);
            
            command_log('Transmitter BIND data received.');
            break;
        case PSP.PSP_REQ_RX_CONFIG:            
            RX_CONFIG.rx_type = data.getUint8(0);
            
            for (var i = 0; i < 13; i++) {
                RX_CONFIG.pinMapping[i] = data.getUint8(1 + i);
            }
            
            RX_CONFIG.flags = data.getUint8(14);
            RX_CONFIG.RSSIpwm = data.getUint8(15);
            RX_CONFIG.beacon_frequency = data.getUint32(16, 1);
            RX_CONFIG.beacon_deadtime = data.getUint8(20);
            RX_CONFIG.beacon_interval = data.getUint8(21);
            RX_CONFIG.minsync = data.getUint16(22, 1);
            RX_CONFIG.failsafe_delay = data.getUint8(24);
            RX_CONFIG.ppmStopDelay = data.getUint8(25);
            RX_CONFIG.pwmStopDelay = data.getUint8(26);
            
            command_log('Receiver module config data <span style="color: green">received</span>.');
            break;
        case PSP.PSP_REQ_RX_JOIN_CONFIGURATION:
            break;
        case PSP.PSP_REQ_SCANNER_MODE:
            break;
        case PSP.PSP_REQ_SPECIAL_PINS:
            var bytes = message_buffer.byteLength;
            
            RX_SPECIAL_PINS = []; // drop previous array
            
            for (var i = 0; i < bytes; i += 2) {
                var object = {'pin': data.getUint8(i), 'type': data.getUint8(i + 1)};
                RX_SPECIAL_PINS.push(object);
            }
            break;
        case PSP.PSP_REQ_FW_VERSION:
            firmware_version = data.getUint16(0, 1);
            var crunched_firmware = read_firmware_version(firmware_version);
            
            command_log('Transmitter Firmware version - <strong>' + crunched_firmware.str + '</strong>');
            
            // change connect/disconnect button from "connecting" status to disconnect
            $('div#port-picker a.connect').text('Disconnect').addClass('active');
            
            if (crunched_firmware.first == firmware_version_accepted[0] && crunched_firmware.second == firmware_version_accepted[1]) { 
                // first 2 version numbers matched, we will let user enter
                send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {                    
                    GUI.lock_all(0); // unlock all tabs
                    GUI.operating_mode = 1; // we are connected
                    
                    // open TX tab
                    $('#tabs li a:first').click();
                });
                
                if (crunched_firmware.third != firmware_version_accepted[2]) {
                    command_log('Minor version <span style="color: red;">mismatch</span>, configurator should work fine with this firmware, but firmware update is recommended.');
                }
            } else {
                command_log('Major version <span style="color: red;">mismatch</span>, please update your module with latest firmware.');
                $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
            }
            break;
        case PSP.PSP_REQ_NUMBER_OF_RX_OUTPUTS:
            numberOfOutputsOnRX = data.getUint8(0);
            break;
        case PSP.PSP_SET_BIND_DATA:
            break;
        case PSP.PSP_SET_RX_CONFIG:
            break;
        case PSP.PSP_SET_TX_SAVE_EEPROM:
            command_log('Transmitter module EEPROM save <span style="color: green">successful</span>.');
            break;
        case PSP.PSP_SET_RX_SAVE_EEPROM:
            var result = data.getUint8(0);
            
            if (result == true) {
                command_log('Receiver module EEPROM save <span style="color: green">successful</span>.');
            } else {
                command_log('Receiver module EEPROM save <span style="color: red">failed</span>.');
            }
            break;
        case PSP.PSP_SET_TX_RESTORE_DEFAULT:
            command_log('Configuration data for transmitter module was <span style="color: green">restored</span> to default.');
            break;
        case PSP.PSP_SET_RX_RESTORE_DEFAULT:
            command_log('Configuration data for receiver module was <span style="color: green">restored</span> to default.');
            break;
        case PSP.PSP_SET_EXIT:
            break;
        default:
            if (debug) console.log('Unknown command: ' + command);
            command_log('PSP - Unknown command: ' + command);
    }
    
    // trigger callbacks, cleanup/remove callback after trigger
    for (var i = (PSP.callbacks.length - 1); i >= 0; i--) { // itterating in reverse because we use .splice which modifies array length
        if (PSP.callbacks[i].code == command) {
            PSP.callbacks[i].callback({'command': command, 'data': data, 'length': message_length_expected});
            
            PSP.callbacks.splice(i, 1); // remove object from array
        }
    }
}

function send_TX_config() {
    var TX_config = new ArrayBuffer(41); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(TX_config, 0);
    
    var needle = 0;

    view.setUint8(needle++, BIND_DATA.version);
    view.setUint32(needle, BIND_DATA.serial_baudrate, 1);
    needle += 4;
    view.setUint32(needle, BIND_DATA.rf_frequency, 1);
    needle += 4;
    view.setUint32(needle, BIND_DATA.rf_magic, 1);
    needle += 4;
    view.setUint8(needle++, BIND_DATA.rf_power);
    view.setUint8(needle++, BIND_DATA.rf_channel_spacing);
    
    for (var i = 0; i < 24; i++) {
        view.setUint8(needle++, BIND_DATA.hopchannel[i]);
    }
    
    view.setUint8(needle++, BIND_DATA.modem_params);
    view.setUint8(needle++, BIND_DATA.flags);
    
    var data = new Uint8Array(TX_config);
    send_message(PSP.PSP_SET_BIND_DATA, data, false, function() {
        command_log('Transmitter BIND data was <span style="color: green">sent</span> to the transmitter module.');
        
        // request EEPROM save
        send_message(PSP.PSP_SET_TX_SAVE_EEPROM);
    });
}

function send_RX_config() {
    var RX_config = new ArrayBuffer(27); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(RX_config, 0);
    
    var needle = 0;
    
    view.setUint8(needle++, RX_CONFIG.rx_type);
    
    for (var i = 0; i < 13; i++) {
        view.setUint8(needle++, RX_CONFIG.pinMapping[i]);
    }
    
    view.setUint8(needle++, RX_CONFIG.flags);
    view.setUint8(needle++, RX_CONFIG.RSSIpwm);
    view.setUint32(needle, RX_CONFIG.beacon_frequency, 1);
    needle += 4;
    view.setUint8(needle++, RX_CONFIG.beacon_deadtime);
    view.setUint8(needle++, RX_CONFIG.beacon_interval);
    view.setUint16(needle, RX_CONFIG.minsync, 1);
    needle += 2;
    view.setUint8(needle++, RX_CONFIG.failsafe_delay);
    view.setUint8(needle++, RX_CONFIG.ppmStopDelay);
    view.setUint8(needle++, RX_CONFIG.pwmStopDelay);
    
    var data = new Uint8Array(RX_config);
    send_message(PSP.PSP_SET_RX_CONFIG, data, false, function() {
        command_log('Receiver CONFIG was <span style="color: green">sent</span> to the receiver module.');
        
        // request EEPROM save
        send_message(PSP.PSP_SET_RX_SAVE_EEPROM);
    });
}
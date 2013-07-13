var PSP = {
    PSP_SYNC1:        0xB5,
    PSP_SYNC2:        0x62,
    
    PSP_REQ_BIND_DATA:              1,
    PSP_REQ_RX_CONFIG:              2,
    PSP_REQ_RX_JOIN_CONFIGURATION:  3,
    PSP_REQ_SCANNER_MODE:           4,
    
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
    PSP_INF_DATA_TOO_LONG: 204
};

var packet_state = 0;
var command;

var message_length_expected = 0;
var message_length_received = 0;
var message_buffer;
var message_buffer_uint8_view;
var message_crc = 0;
var char_counter = 0;

function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            switch (packet_state) {
                case 0:
                    if (data[i] == PSP.PSP_SYNC1) {               
                        packet_state++;
                    }
                    break;
                case 1:
                    if (data[i] == PSP.PSP_SYNC2) {             
                        packet_state++;
                    } else {
                        packet_state = 0; // Restart and try again
                    }                    
                    break;
                case 2: // command
                    command = data[i];
                    message_crc = data[i];
                    
                    packet_state++;
                    
                    break;
                case 3: // payload length LSB
                    message_length_expected = data[i];
                    message_crc ^= data[i];
                    
                    packet_state++;
                    break;
                case 4: // payload length MSB
                    message_length_expected |= data[i] << 8;
                    message_crc ^= data[i];
                    
                    // setup arraybuffer
                    message_buffer = new ArrayBuffer(message_length_expected);
                    message_buffer_uint8_view = new Uint8Array(message_buffer);
                    
                    packet_state++;
                    break;
                case 5: // payload
                    message_buffer_uint8_view[message_length_received] = data[i];
                    message_crc ^= data[i];
                    message_length_received++;
                    
                    if (message_length_received >= message_length_expected) {
                        packet_state++;
                    }
                break;
                case 6:
                    if (message_crc == data[i]) {
                        // message received, process
                        process_data(command, message_buffer);
                    } else {
                        // crc failed
                        console.log('crc failed');
                    }   
                    
                    // Reset variables
                    message_length_received = 0;
                    
                    packet_state = 0;
                    break;
            }
            
            char_counter++;
        }
    }
}

function send_message(code, data, callback) {
    // always reserve 6 bytes for protocol overhead !
    if (typeof data === 'object') {
        var size = 6 + data.length;
        var checksum = 0;
        
        var bufferOut = new ArrayBuffer(size);
        var bufView = new Uint8Array(bufferOut); 

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
        var bufferOut = new ArrayBuffer(6 + 1);
        var bufView = new Uint8Array(bufferOut);
        
        bufView[0] = PSP.PSP_SYNC1;
        bufView[1] = PSP.PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = 0x01; // payload length LSB
        bufView[4] = 0x00; // payload length MSB
        bufView[5] = data; // payload
        bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; // crc        
    }
    
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
        if (writeInfo.bytesWritten > 0) {
            if (typeof callback !== 'undefined') {
                callback();
            }
        }
        
        // for debugging purposes
        // console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
    });    
}

function process_data(command, message_buffer) {
    var data = new DataView(message_buffer, 0); // DataView (allowing is to view arrayBuffer as struct/union)
    
    switch (command) {
        case PSP.PSP_REQ_BIND_DATA:
            BIND_DATA.version = data.getUint8(0);
            BIND_DATA.rf_frequency = data.getUint32(1, 1);
            BIND_DATA.rf_magic = data.getUint32(5, 1);
            BIND_DATA.rf_power = data.getUint8(9);
            BIND_DATA.hopcount = data.getUint8(10);
            BIND_DATA.rf_channel_spacing = data.getUint8(11);
            
            for (var i = 0; i < 24; i++) {
                BIND_DATA.hopchannel[i] =  data.getUint8(12 + i);
            }
            
            BIND_DATA.modem_params = data.getUint8(36);
            BIND_DATA.flags = data.getUint8(37);
            
            command_log('Transmitter BIND data received.');
            
            TX_data_received = true;
            
            // open TX tab
            $('#tabs li a:first').click();
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
            
            command_log('Receiver module config data <span style="color: green">received</span>.');
            break;
        case PSP.PSP_REQ_RX_JOIN_CONFIGURATION:
            connected_to_RX = parseInt(data.getUint8(0));
            
            switch (connected_to_RX) {
                case 1:
                    command_log('Connection to the receiver module <span style="color: green">successfully</span> established.');
                    send_message(PSP.PSP_REQ_RX_CONFIG, 1, function() {
                        setTimeout(function() {
                            tab_initialize_rx_module(); // load standard RX module html
                        }, 100);
                    });
                    break;
                case 2:
                    command_log('Connection to the receiver module timed out.');
                    $('#tabs li a:first').click(); // reset back to the TX module tab
                    break;
                case 3:
                    command_log('Failed response from the receiver module.');
                    $('#tabs li a:first').click(); // reset back to the TX module tab
                    break
            }
            break;
        case PSP.PSP_SET_TX_SAVE_EEPROM:
            command_log('Transmitter module EEPROM save <span style="color: green">successfull</span>.');
            break;
        case PSP.PSP_SET_RX_SAVE_EEPROM:
            var result = data.getUint8(0);
            
            if (result == true) {
                command_log('Receiver module EEPROM save <span style="color: green">successfull</span>.');
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
        default:
            console.log('Unknown command: ' + command);
    }
}

function send_TX_config() {
    var TX_config = new ArrayBuffer(38); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(TX_config, 0);
    
    var needle = 0;

    view.setUint8(needle++, BIND_DATA.version);
    view.setUint32(needle, BIND_DATA.rf_frequency, 1);
    needle += 4;
    view.setUint32(needle, BIND_DATA.rf_magic, 1);
    needle += 4;
    view.setUint8(needle++, BIND_DATA.rf_power);
    view.setUint8(needle++, BIND_DATA.hopcount);
    view.setUint8(needle++, BIND_DATA.rf_channel_spacing);
    
    for (var i = 0; i < 24; i++) {
        view.setUint8(needle++, BIND_DATA.hopchannel[i]);
    }
    
    view.setUint8(needle++, BIND_DATA.modem_params);
    view.setUint8(needle++, BIND_DATA.flags);
    
    var data = new Uint8Array(TX_config);
    send_message(PSP.PSP_SET_BIND_DATA, data, function() {
        // request EEPROM save
        send_message(PSP.PSP_SET_TX_SAVE_EEPROM, 1);
        command_log('Transmitter BIND data was <span style="color: green">sent</span> to the transmitter module.');
    });
}

function send_RX_config() {
    var RX_config = new ArrayBuffer(25); // size must always match the struct size on the mcu, otherwise transmission will fail!
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
    
    var data = new Uint8Array(RX_config);
    send_message(PSP.PSP_SET_RX_CONFIG, data, function() {
        command_log('Receiver CONFIG was <span style="color: green">sent</span> to the receiver module.');
        // request EEPROM save
        send_message(PSP.PSP_SET_RX_SAVE_EEPROM, 1);
    });
}
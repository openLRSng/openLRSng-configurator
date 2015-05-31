'use strict';

var CONFIGURATOR = {
    'releaseDate':              1433099837000, // 2015.05.31 - new Date().getTime()
    'firmwareVersionEmbedded':  [3, 8, 5], // version of firmware that ships with the app, dont forget to also update initialize_configuration_objects switch !
    'firmwareVersionLive':      0, // version number in single uint16 [8bit major][4bit][4bit] fetched from mcu
    'activeProfile':            0, // currently active profile on tx module (each profile can correspond to different BIND_DATA)
    'defaultProfile':           0, // current default profile setting on tx module
    'connectingToRX':           false, // indicates if TX is trying to connect to RX
    'readOnly':                 false // indicates if data can be saved to eeprom
};

var STRUCT_PATTERN,
    TX_CONFIG,
    RX_CONFIG,
    BIND_DATA;

// live PPM data
var PPM = {
    ppmAge:     0,
    channels:   Array(16)
};

var RX_SPECIAL_PINS = [];
var NUMBER_OF_OUTPUTS_ON_RX = 0;
var RX_FAILSAFE_VALUES = [];

// pin_map "helper" object (related to pin/port map of specific units)
var PIN_MAP = {
    0x20: 'PPM',
    0x21: 'RSSI',
    0x22: 'SDA',
    0x23: 'SCL',
    0x24: 'RXD',
    0x25: 'TXD',
    0x26: 'ANALOG',
    0x27: 'Packet loss - Beeper', // LBEEP
    0x28: 'Spektrum satellite', // spektrum satellite output
    0x29: 'SBUS',
    0x2A: 'SUMD',
    0x2B: 'Link Loss Indication'
};

// 0 = default 433
// 1 = RFMXX_868
// 2 = RFMXX_915
var frequencyLimits = {
    min:        null,
    max:        null,
    minBeacon:  null,
    maxBeacon:  null
};

function initializeFrequencyLimits(rfmType) {
    switch (rfmType) {
        case 0:
            frequencyLimits.min = 413000000;
            frequencyLimits.max = 463000000;
            frequencyLimits.minBeacon = 413000000;
            frequencyLimits.maxBeacon = 463000000;
            break;
        case 1:
            frequencyLimits.min = 848000000;
            frequencyLimits.max = 888000000;
            frequencyLimits.minBeacon = 413000000;
            frequencyLimits.maxBeacon = 888000000;
            break;
        case 2:
            frequencyLimits.min = 895000000;
            frequencyLimits.max = 935000000;
            frequencyLimits.minBeacon = 413000000;
            frequencyLimits.maxBeacon = 935000000;
            break;

        default:
            frequencyLimits.min = 0;
            frequencyLimits.max = 0;
            frequencyLimits.minBeacon = 0;
            frequencyLimits.maxBeacon = 0;
    }
}

function initialize_configuration_objects(version) {
    switch (version >> 4) {
        case 0x38:
        case 0x37:
            CONFIGURATOR.readOnly = false;

            var TX = [
                {'name': 'rfm_type', 'type': 'u8'},
                {'name': 'max_frequency', 'type': 'u32'},
                {'name': 'flags', 'type': 'u32'},
                {'name': 'chmap', 'type': 'array', 'of': 'u8', 'length': 16}
            ];

            var BIND = [
                {'name': 'version', 'type': 'u8'},
                {'name': 'serial_baudrate', 'type': 'u32'},
                {'name': 'rf_frequency', 'type': 'u32'},
                {'name': 'rf_magic', 'type': 'u32'},
                {'name': 'rf_power', 'type': 'u8'},
                {'name': 'rf_channel_spacing', 'type': 'u8'},
                {'name': 'hopchannel', 'type': 'array', 'of': 'u8', 'length': 24},
                {'name': 'modem_params', 'type': 'u8'},
                {'name': 'flags', 'type': 'u8'}
            ];

            var RX = [
                {'name': 'rx_type', 'type': 'u8'},
                {'name': 'pinMapping', 'type': 'array', 'of': 'u8', 'length': 13},
                {'name': 'flags', 'type': 'u8'},
                {'name': 'RSSIpwm', 'type': 'u8'},
                {'name': 'beacon_frequency', 'type': 'u32'},
                {'name': 'beacon_deadtime', 'type': 'u8'},
                {'name': 'beacon_interval', 'type': 'u8'},
                {'name': 'minsync', 'type': 'u16'},
                {'name': 'failsafe_delay', 'type': 'u8'},
                {'name': 'ppmStopDelay', 'type': 'u8'},
                {'name': 'pwmStopDelay', 'type': 'u8'}
            ];
            break;
        case 0x36:
            CONFIGURATOR.readOnly = true;

            var TX = [
                {'name': 'rfm_type', 'type': 'u8'},
                {'name': 'max_frequency', 'type': 'u32'},
                {'name': 'flags', 'type': 'u32'}
            ];

            var BIND = [
                {'name': 'version', 'type': 'u8'},
                {'name': 'serial_baudrate', 'type': 'u32'},
                {'name': 'rf_frequency', 'type': 'u32'},
                {'name': 'rf_magic', 'type': 'u32'},
                {'name': 'rf_power', 'type': 'u8'},
                {'name': 'rf_channel_spacing', 'type': 'u8'},
                {'name': 'hopchannel', 'type': 'array', 'of': 'u8', 'length': 24},
                {'name': 'modem_params', 'type': 'u8'},
                {'name': 'flags', 'type': 'u8'}
            ];

            var RX = [
                {'name': 'rx_type', 'type': 'u8'},
                {'name': 'pinMapping', 'type': 'array', 'of': 'u8', 'length': 13},
                {'name': 'flags', 'type': 'u8'},
                {'name': 'RSSIpwm', 'type': 'u8'},
                {'name': 'beacon_frequency', 'type': 'u32'},
                {'name': 'beacon_deadtime', 'type': 'u8'},
                {'name': 'beacon_interval', 'type': 'u8'},
                {'name': 'minsync', 'type': 'u16'},
                {'name': 'failsafe_delay', 'type': 'u8'},
                {'name': 'ppmStopDelay', 'type': 'u8'},
                {'name': 'pwmStopDelay', 'type': 'u8'}
            ];
            break;

        default:
            return false;
    }

    STRUCT_PATTERN = {'TX_CONFIG': TX, 'RX_CONFIG': RX, 'BIND_DATA': BIND};

    if (CONFIGURATOR.readOnly) {
        GUI.log(chrome.i18n.getMessage('running_in_compatibility_mode'));
    }

    return true;
}

function read_firmware_version(num) {
    var data = {'str': undefined, 'first': 0, 'second': 0, 'third': 0};

    data.first = num >> 8;
    data.str = data.first + '.';

    data.second = ((num >> 4) & 0x0f);
    data.str += data.second + '.';

    data.third = num & 0x0f;
    data.str += data.third;

    return data;
}

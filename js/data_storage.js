'use strict';

var CONFIGURATOR = {
    'releaseDate': 1410688784300, // 09.14.2014 - new Date().getTime()
    'firmwareVersionEmbedded': [3, 7, 2], // version of firmware that ships with the app
    'firmwareVersionLive': 0, // version number in single uint16 [8bit major][4bit][4bit] fetched from mcu
    'activeProfile': 0, // currently active profile on tx module (each profile can correspond to different BIND_DATA)
    'connectingToRX': false, // indicates if TX is trying to connect to RX
    'readOnly': false // indicates if data can be saved to eeprom
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
var MIN_RFM_FREQUENCY,
    MAX_RFM_FREQUENCY;

function hw_frequency_limits(hw) {
    switch (hw) {
        case 0:
            MIN_RFM_FREQUENCY = 413000000;
            MAX_RFM_FREQUENCY = 463000000;
            break;
        case 1:
            MIN_RFM_FREQUENCY = 848000000;
            MAX_RFM_FREQUENCY = 888000000;
            break;
        case 2:
            MIN_RFM_FREQUENCY = 895000000;
            MAX_RFM_FREQUENCY = 935000000;
            break;
    }
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
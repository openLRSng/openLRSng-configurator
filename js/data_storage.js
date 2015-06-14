'use strict';

var CONFIGURATOR = {
    'releaseDate':              1432110788960, // 2015.05.20 - new Date().getTime()
    'firmwareVersionEmbedded':  [3, 9, 0], // version of firmware that ships with the app, dont forget to also update initialize_configuration_objects switch !
    'connectingToRX':           false, // indicates if TX is trying to connect to RX
    'readOnly':                 false // indicates if data can be saved to eeprom
};

var STRUCT_PATTERN;

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

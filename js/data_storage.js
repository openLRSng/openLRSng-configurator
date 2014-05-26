var firmware_version_accepted = [3, 6, 4];
var firmware_version_embedded = [3, 6, 4]; // used in firmware flasher area (as generic info)

// version number in single uint16 [8bit major][4bit][4bit] fetched from mcu
var firmware_version = 0;

// currently active profile on tx module (each profile can correspond to different BIND_DATA)
var activeProfile = 0;

// bind_data struct (exact replica of one stored inside MCU)
var BIND_DATA = {
    version:            0,
    serial_baudrate:    0,
    rf_frequency:       0,
    rf_magic:           0,
    rf_power:           0,
    rf_channel_spacing: 0,
    hopchannel:         Array(24),
    modem_params:       0,
    flags:              0
};

// tx_config (exact replica of one stored inside MCU)
var TX_CONFIG = {
    rfm_type:       0,
    max_frequency:  0,
    flags:          0
};

// live PPM data
var PPM = {
    ppmAge:     0,
    channels:   Array(16)
};

// rx_config (exact replica of one stored inside MCU)
var RX_CONFIG = {
    rx_type:          0,
    pinMapping:       Array(13),
    flags:            0,
    RSSIpwm:          0,
    beacon_frequency: 0,
    beacon_deadtime:  0,
    beacon_interval:  0,
    minsync:          0,
    failsafe_delay:   0,
    ppmStopDelay:     0,
    pwmStopDelay:     0
};

var RX_SPECIAL_PINS = [];
var numberOfOutputsOnRX = 0;
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
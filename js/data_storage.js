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

// rx_config (exact replica of one stored inside MCU)
var RX_CONFIG = {
    rx_type:          0, // 1 = RX_FLYTRON8CH, 2 = RX_OLRSNG4CH, 3 = RX_OLRSNG12CH
    pinMapping:       Array(13),
    flags:            0,
    RSSIpwm:          0,
    beacon_frequency: 0,
    beacon_deadtime:  0,
    beacon_interval:  0,
    minsync:          0,
    failsafe_delay:   0
};

// pin_map "helper" object (related to pin/port map of specific units)
var PIN_MAP = {
    PPM:    0x20,
    RSSI:   0x21,
    SDA:    0x22,
    SCL:    0x23,
    RXD:    0x24,
    TXD:    0x25,
    ANALOG: 0x26
};

var TX_data_received = 0; // will be flipped after BIND_DATA is received (would be nice to find a way to remove this variable)

// GUI "helper" object, storing current UI state, currently locked elements, etc
var GUI = {
    operating_mode: 0, // 0 = normal operation (configurator), 1 = firmware flash mode, 2 = etc (not used, yet)
    connect_lock:   false,
    tab_lock:       new Array(3)
};
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

// GUI "helper" object, storing current UI state, currently locked elements, etc
// Mode guide -
// 0 = disconnected (or "connection not established yet")
// 1 = normal operation (configurator)
// 2 = firmware flash mode, 3 = etc (not used, yet)
var GUI = {
    operating_mode: 0, 
    connect_lock:   false,
    tab_lock:       new Array(3)
};
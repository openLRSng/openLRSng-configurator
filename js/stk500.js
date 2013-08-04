var STK500 = {
    // STK Response constants
    Resp_STK_OK:                0x10,
    Resp_STK_FAILED:            0x11,
    Resp_STK_UNKNOWN:           0x12,
    Resp_STK_NODEVICE:          0x13,
    Resp_STK_INSYNC:            0x14,
    Resp_STK_NOSYNC:            0x15,
    
    Resp_ADC_CHANNEL_ERROR:     0x16,
    Resp_ADC_MEASURE_OK:        0x17,
    Resp_PWM_CHANNEL_ERROR:     0x18,
    Resp_PWM_ADJUST_OK:         0x19,
    
    // STK Special constants
    Sync_CRC_EOP:               0x20, // 'SPACE'
    
    // STK Command constants
    Cmnd_STK_GET_SYNC:          0x30,
    Cmnd_STK_GET_SIGN_ON:       0x31,
    Cmnd_STK_RESET:             0x32,
    Cmnd_STK_SINGLE_CLOCK:      0x33,
    Cmnd_STK_STORE_PARAMETERS:  0x34,
    
    Cmnd_STK_SET_PARAMETER:     0x40,
    Cmnd_STK_GET_PARAMETER:     0x41,
    Cmnd_STK_SET_DEVICE:        0x42,
    Cmnd_STK_GET_DEVICE:        0x43,
    Cmnd_STK_GET_STATUS:        0x44,
    Cmnd_STK_SET_DEVICE_EXT:    0x45,
    
    Cmnd_STK_ENTER_PROGMODE:    0x50,
    Cmnd_STK_LEAVE_PROGMODE:    0x51,
    Cmnd_STK_CHIP_ERASE:        0x52,
    Cmnd_STK_CHECK_AUTOINC:     0x53,
    Cmnd_STK_CHECK_DEVICE:      0x54,
    Cmnd_STK_LOAD_ADDRESS:      0x55,
    Cmnd_STK_UNIVERSAL:         0x56,
    
    Cmnd_STK_PROG_FLASH:        0x60,
    Cmnd_STK_PROG_DATA:         0x61,
    Cmnd_STK_PROG_FUSE:         0x62,
    Cmnd_STK_PROG_LOCK:         0x63,
    Cmnd_STK_PROG_PAGE:         0x64,
    Cmnd_STK_PROG_FUSE_EXT:     0x65,
    
    Cmnd_STK_READ_FLASH:        0x70,
    Cmnd_STK_READ_DATA:         0x71,
    Cmnd_STK_READ_FUSE:         0x72,
    Cmnd_STK_READ_LOCK:         0x73,
    Cmnd_STK_READ_PAGE:         0x74,
    Cmnd_STK_READ_SIGN:         0x75,
    Cmnd_STK_READ_OSCCAL:       0x76,
    Cmnd_STK_READ_FUSE_EXT:     0x77,
    Cmnd_STK_READ_OSCCAL_EXT:   0x78,
    
    // STK Parameter constants
    Parm_STK_HW_VER:            0x80, // R
    Parm_STK_SW_MAJOR:          0x81, // R
    Parm_STK_SW_MINOR:          0x82, // R
    Parm_STK_LEDS:              0x83, // R/W
    Parm_STK_VTARGET:           0x84, // R/W
    Parm_STK_VADJUST:           0x85, // R/W
    Parm_STK_OSC_PSCALE:        0x86, // R/W
    Parm_STK_OSC_CMATCH:        0x87, // R/W
    Parm_STK_RESET_DURATION:    0x88, // R/W
    Parm_STK_SCK_DURATION:      0x89, // R/W
    
    Parm_STK_BUFSIZEL:          0x90, // R/W, Range 0 - 255
    Parm_STK_BUFSIZEH:          0x91, // R/W, Range 0 - 255
    Parm_STK_DEVICE:            0x92, // R/W, Range 0 - 255
    Parm_STK_PROGMODE:          0x93, // p or S
    Parm_STK_PARAMODE:          0x94, // TRUE or FALSE
    Parm_STK_POLLING:           0x95, // TRUE or FALSE
    Parm_STK_SELFTIMED:         0x96  // TRUE or FALSE
};

var CHIP_INFO = {
    HW_VER: 0,
    SW_MAJOR: 0,
    SW_MINOR: 0,
    TOPCARD_DETECT: 0,
    SIGNATURE: ''
};

var stk_receive_buffer = new Array();
var stk_receive_buffer_i = 0;
function stk_send(Array, chars_to_read, callback) {
    var bufferOut = new ArrayBuffer(Array.length);
    var bufferView = new Uint8Array(bufferOut);
    
    for (var i = 0; i < Array.length; i++) {
        bufferView[i] = Array[i];
    }
    
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {});
    
    clearTimeout(stk_read_timer); // remove timer (in case previous read timer is still alive, which shouldn't be !!!)
    stk_read(chars_to_read, callback);
}

var stk_read_retry = 0;
var stk_read_timer;
function stk_read(chars_to_read, callback) {
    chrome.serial.read(connectionId, chars_to_read, function(readInfo) {
        if (readInfo && readInfo.bytesRead > 0 && readInfo.data) { 
            var data = new Uint8Array(readInfo.data);
            
            for (var i = 0; i < data.length; i++) {
                stk_receive_buffer[stk_receive_buffer_i++] = data[i];
                
                // if (data[i] == STK500.Resp_STK_OK) {
                if (stk_receive_buffer_i >= chars_to_read) {
                    clearTimeout(stk_read_timer); // remove timer (just in case)
                    
                    callback(stk_receive_buffer); // callback with buffer content
                    
                    // reset buffers
                    stk_receive_buffer = [];
                    stk_receive_buffer_i = 0;
                    
                    // also reset retries
                    stk_read_retry = 0;
                }
            }
        } else {
            // read blocked, we need to retry until we get the desired length or char
            // we will retry in 1 ms
            stk_read_timer = setTimeout(function() {
                stk_read(chars_to_read, callback);
            }, 1);
            
            stk_read_retry++;
            if (stk_read_retry >= 250) { // 250 ms total
                // something went wrong, remove timer and throw error
                clearTimeout(stk_read_timer);
                
                // reset variables and empty buffer
                stk_read_retry = 0;
                
                stk_receive_buffer = [];
                stk_receive_buffer_i = 0;
            }
        }
    });
}

var STK500_protocol = function() {
    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;
  
    this.bytes_to_read; // ref
    this.read_callback; // ref
    
    this.flashing_memory_address = 0;
    this.blocks_flashed = 0;
    this.verify_memory_address = 0;
    this.blocks_read = 0;
    this.eeprom_blocks_erased = 0;
    
    this.verify_hex = new Array();
    
    this.steps_executed = 0;
    this.steps_executed_last = 0;
    this.upload_time_start = 0;    
    
    // STK500 Commands
    this.command = {
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
};

STK500_protocol.prototype.initialize = function() {
    var self = this;
    
    // reset and set some variables before we start
    self.steps_executed = 0;
    self.steps_executed_last = 0;
    self.flashing_memory_address = 0;
    self.blocks_flashed = 0;
    self.verify_memory_address = 0;
    self.blocks_read = 0;
    self.eeprom_blocks_erased = 0;
    self.verify_hex = [];
    self.upload_time_start = microtime(); 
    
    GUI.interval_add('firmware_uploader_read', function() {
        self.read();
    }, 1, true);
    
    var upload_procedure_retry = 0;
    if (debug) console.log('Sending DTR command ...');
    chrome.serial.setControlSignals(connectionId, {dtr: true}, function(result) {
        // connect to MCU via STK
        if (debug) console.log('Trying to get into sync with STK500');
        GUI.interval_add('firmware_upload_start', function() {
            self.send([self.command.Cmnd_STK_GET_SYNC, self.command.Sync_CRC_EOP], 2, function(data) {
                if (data[0] == self.command.Resp_STK_INSYNC && data[1] == self.command.Resp_STK_OK) {                            
                    // stop timer from firing any more get sync requests
                    GUI.interval_remove('firmware_upload_start');
                    
                    if (debug) console.log('Script in sync with STK500');
                    
                    // Timer checking for STK timeout
                    GUI.interval_add('STK_timeout', function() {
                        if (self.steps_executed > self.steps_executed_last) { // process is running
                            self.steps_executed_last = self.steps_executed;
                        } else {
                            if (debug) console.log('STK500 timed out, programming failed ...');
                            command_log('STK500 timed out, programming <span style="color: red">failed</span> ...');
                            
                            // protocol got stuck, clear timer and disconnect
                            GUI.interval_remove('STK_timeout');
                            
                            // exit
                            self.upload_procedure(99);
                        }
                    }, 1000);
                    
                    // proceed to next step
                    self.upload_procedure(1);                    
                } else {
                    // STK is not in sync (we will try again)
                }
            });
            
            if (upload_procedure_retry++ >= 30) { // 3 seconds (50 ms * 60 times / 100 ms * 30 times)
                // stop timer from firing any more get sync requests
                GUI.interval_remove('firmware_upload_start');
                
                command_log('Connection to the module failed');
                if (debug) console.log('Connection to the module failed');
                
                // exit
                self.upload_procedure(99);
            }
        }, 100);
    });
};

STK500_protocol.prototype.read = function() {
    var self = this;
    
    chrome.serial.read(connectionId, 128, function(readInfo) {
        if (readInfo && readInfo.bytesRead > 0) { 
            var data = new Uint8Array(readInfo.data);
            
            for (var i = 0; i < data.length; i++) {
                self.receive_buffer[self.receive_buffer_i++] = data[i];
                
                if (self.receive_buffer_i == self.bytes_to_read) {                      
                    self.read_callback(self.receive_buffer); // callback with buffer content
                }  
            }
        }
    });
}

STK500_protocol.prototype.send = function(Array, bytes_to_read, callback) {
    var bufferOut = new ArrayBuffer(Array.length);
    var bufferView = new Uint8Array(bufferOut);
    
    // set Array values inside bufferView (alternative to for loop)
    bufferView.set(Array);
    
    // update references
    this.bytes_to_read = bytes_to_read;
    this.read_callback = callback; 
    
    // reset receiving buffers as we are sending & requesting new message
    this.receive_buffer = [];
    this.receive_buffer_i = 0;

    // send over the actual data
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {}); 
}

STK500_protocol.prototype.verify_flash = function(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        for (var inner = 0; inner < first_array[i].length; inner++) {
            if (first_array[i][inner] != second_array[i][inner]) {
                return false;
            }
        }
    }
    
    return true;
}

STK500_protocol.prototype.upload_procedure = function(step) {
    var self = this;
    self.steps_executed++;
    
    switch (step) {
        case 1:
            // read device signature (3 bytes)
            self.send([self.command.Cmnd_STK_READ_SIGN, self.command.Sync_CRC_EOP], 5, function(data) {
                if (debug) console.log('Requesting device signature - ' + data);
                
                // we need to verify chip signature
                if (verify_chip_signature(data[1], data[2], data[3])) {   
                    var erase_eeprom = $('div.erase_eeprom input').prop('checked');
                    
                    if (erase_eeprom) {
                        command_log('Erasing EEPROM...');
                        
                        // proceed to next step
                        self.upload_procedure(5);
                    } else {
                        command_log('Writing data ...');
                        
                        // jump over 1 step
                        self.upload_procedure(6);
                    }
                    
                } else {
                    command_log('Chip not supported, sorry :-(');
                    
                    // disconnect
                    self.upload_procedure(99);
                }
            });
            break;
        case 5:         
            // erase eeprom
            self.send([self.command.Cmnd_STK_LOAD_ADDRESS, lowByte(self.eeprom_blocks_erased), highByte(self.eeprom_blocks_erased), self.command.Sync_CRC_EOP], 2, function(data) { 
                if (self.eeprom_blocks_erased < 256) {
                    if (debug) console.log('Erasing: ' + self.eeprom_blocks_erased + ' - ' + data);
                    
                    self.send([self.command.Cmnd_STK_PROG_PAGE, 0x00, 0x04, 0x45, 0xFF, 0xFF, 0xFF, 0xFF, self.command.Sync_CRC_EOP], 2, function(data) {
                        self.eeprom_blocks_erased++;
                        
                        // wipe another block
                        self.upload_procedure(5);
                    });
                } else {
                    command_log('EEPROM <span style="color: green;">erased</span>');
                    command_log('Writing data ...');

                    // proceed to next step
                    self.upload_procedure(6);
                }
            });
            break;
        case 6:           
            // memory block address seems to increment by 64 for each block (probably because of 64 words per page (total of 256 pages), 1 word = 2 bytes)            
            self.send([self.command.Cmnd_STK_LOAD_ADDRESS, lowByte(self.flashing_memory_address), highByte(self.flashing_memory_address), self.command.Sync_CRC_EOP], 2, function(data) {                
                if (self.blocks_flashed < uploader_hex_to_flash_parsed.length) {
                    if (debug) console.log('Writing to: ' + self.flashing_memory_address + ' - ' + data);
                    
                    var array_out = new Array(uploader_hex_to_flash_parsed[self.blocks_flashed].length + 5); // 5 byte overhead
                    
                    array_out[0] = self.command.Cmnd_STK_PROG_PAGE;
                    array_out[1] = 0x00; // high byte length
                    array_out[2] = uploader_hex_to_flash_parsed[self.blocks_flashed].length; // low byte length, should be 128 bytes max
                    array_out[3] = 0x46; // F = flash memory
                    array_out[array_out.length - 1] = self.command.Sync_CRC_EOP;
                    
                    for (var i = 0; i < uploader_hex_to_flash_parsed[self.blocks_flashed].length; i++) {
                        array_out[i + 4] = uploader_hex_to_flash_parsed[self.blocks_flashed][i]; // + 4 bytes because of protocol overhead
                    }
                    
                    self.send(array_out, 2, function(data) {                        
                        self.flashing_memory_address += 64;
                        self.blocks_flashed++;
                        
                        // flash another block
                        self.upload_procedure(6);
                    });
                } else {
                    command_log('Writing <span style="color: green;">done</span>');
                    command_log('Verifying data ...');
                    
                    // proceed to next step
                    self.upload_procedure(7);
                }
            });
            break;
        case 7:
            // verify
            self.send([self.command.Cmnd_STK_LOAD_ADDRESS, lowByte(self.verify_memory_address), highByte(self.verify_memory_address), self.command.Sync_CRC_EOP], 2, function(data) {
                if (self.blocks_read < uploader_hex_to_flash_parsed.length) {
                    if (debug) console.log('Reading from: ' + self.verify_memory_address + ' - ' + data);
                    
                    var block_length = uploader_hex_to_flash_parsed[self.blocks_read].length; // block length saved in its own variable to avoid "slow" traversing/save clock cycles
                    
                    self.send([self.command.Cmnd_STK_READ_PAGE, 0x00, block_length, 0x46, self.command.Sync_CRC_EOP], (block_length + 2), function(data) {
                        // process & store received data
                        data.shift(); // remove first sync byte
                        data.pop(); // remove last sync byte
                        
                        self.verify_hex[self.blocks_read] = data;
                        
                        // bump up the key
                        self.verify_memory_address += 64;
                        self.blocks_read++;
                        
                        // verify another block
                        self.upload_procedure(7);
                    });
                } else {
                    var result = self.verify_flash(uploader_hex_to_flash_parsed, self.verify_hex);
                    
                    if (result) {
                        command_log('Verifying <span style="color: green;">done</span>');
                        command_log('Programming: <span style="color: green;">SUCCESSFUL</span>');
                    } else {
                        command_log('Verifying <span style="color: red;">failed</span>');
                        command_log('Programming: <span style="color: red;">FAILED</span>');
                    }
                    
                    // proceed to next step
                    self.upload_procedure(99);                    
                }
            });
            break;
        case 99: 
            // disconnect
            GUI.interval_remove('firmware_uploader_read'); // stop reading serial
            GUI.interval_remove('STK_timeout'); // stop stk timeout timer (everything is finished now)
            
            if (debug) console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');
            if (debug) console.log('Script finished after: ' + self.steps_executed + ' steps');
            
            // close connection
            chrome.serial.close(connectionId, function(result) {
                if (result) { // All went as expected
                    if (debug) console.log('Connection closed successfully.');
                    command_log('<span style="color: green">Successfully</span> closed serial connection');
                    
                    connectionId = -1; // reset connection id
                } else { // Something went wrong
                    if (connectionId > 0) {
                        if (debug) console.log('There was an error that happened during "connection-close" procedure');
                        command_log('<span style="color: red">Failed</span> to close serial port');
                    } 
                }
                
                // unlocking connect button
                GUI.connect_lock = false;
            });
            break;
    }
}

// initialize object
var STK500 = new STK500_protocol();
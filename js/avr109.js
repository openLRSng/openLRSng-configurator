var AVR109_protocol = function() {
    this.hex_to_flash; // data to flash
    
    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;
    
    this.bytes_to_read; // ref
    this.read_callback; // ref
    
    this.blocks_flashed = 0;
    this.blocks_read = 0;
    this.eeprom_blocks_erased = 0;
    
    this.steps_executed = 0;
    this.steps_executed_last = 0;
    this.upload_time_start = 0;
    
    // AVR109 Commands
    this.command = {
        enter_programming_mode: 0x50,           // "P"
        auto_increment_address: 0x61,           // "a"
        set_address: 0x41,                      // "A"
        write_program_memory_low_byte: 0x63,    // "c"
        write_program_memory_high_byte: 0x43,   // "C"
        issue_page_write: 0x6D,                 // "m"
        read_lock_bits: 0x72,                   // "r"
        read_program_memory: 0x52,              // "R"
        read_data_memory: 0x64,                 // "d"
        write_data_memory: 0x44,                // "D"
        chip_erase: 0x65,                       // "e"
        write_lock_bits: 0x6C,                  // "l"
        read_fuse_bits: 0x46,                   // "F"
        read_high_fuse_bits: 0x4E,              // "N"
        read_extended_fuse_bits: 0x51,          // "Q"
        leave_programming_mode: 0x4C,           // "L"
        select_device_type: 0x54,               // "T"
        read_signature_bytes: 0x73,             // "s"
        return_supported_device_codes: 0x74,    // "t"
        return_software_identifier: 0x53,       // "S"
        return_software_Version: 0x56,          // "V"
        return_programmer_type: 0x70,           // "p"
        set_LED: 0x78,                          // "x"
        clear_LED: 0x79,                        // "y"
        exit_bootloader: 0x45,                  // "E" 
        check_block_support: 0x62,              // "b"
        start_block_flash_load: 0x42,           // "B"
        start_block_eeprom_load: 0x42,          // "B"
        start_block_flash_read: 0x67,           // "g"
        start_block_eeprom_read: 0x67           // "g"
    };
};

// hex_to_flash = parsed hex file in raw format, split into 128 byte long array "blocks"
AVR109_protocol.prototype.initialize = function(hex_to_flash) {
    var self = this;
    
    // reset and set some variables before we start
    self.hex_to_flash = hex_to_flash;
    
    self.steps_executed = 0;
    self.steps_executed_last = 0;
    self.blocks_flashed = 0;
    self.blocks_read = 0;
    self.eeprom_blocks_erased = 0;
    self.upload_time_start = microtime();    
    
    GUI.interval_add('firmware_uploader_read', function() {
        self.read();
    }, 1, true);

    GUI.interval_add('AVR109_timeout', function() {
        if (self.steps_executed > self.steps_executed_last) { // process is running
            self.steps_executed_last = self.steps_executed;
        } else {
            if (debug) console.log('AVR109 timed out, programming failed ...');
            command_log('AVR109 timed out, programming <span style="color: red">failed</span> ...');
            
            // protocol got stuck, clear timer and disconnect
            GUI.interval_remove('AVR109_timeout');
            
            // exit
            self.upload_procedure(99);
        }
    }, 1000);
    
    self.upload_procedure(1);
};

// no input parameters
// this method should be executed every 1 ms via interval timer
AVR109_protocol.prototype.read = function() {    
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
};

// Array = array of bytes that will be send over serial
// bytes_to_read = received bytes necessary to trigger read_callback
// callback = function that will be executed after received bytes = bytes_to_read
AVR109_protocol.prototype.send = function(Array, bytes_to_read, callback) {
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
};

// first_array = one block of flash data
// second_array = one block of received flash data through serial
// return = true/false
AVR109_protocol.prototype.verify_flash = function(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        if (first_array[i] != second_array[i]) {
            return false;
        }
    }

    return true;
};

// step = value depending on current state of upload_procedure
AVR109_protocol.prototype.upload_procedure = function(step) {
    var self = this;
    self.steps_executed++;
    
    switch (step) {
        case 1:
            // Request device signature
            self.send([self.command.read_signature_bytes], 3, function(data) {
                if (debug) console.log('AVR109 - Requesting signature: ' + data);
                
                if (verify_chip_signature(data[2], data[1], data[0])) {
                    // proceed to next step
                    self.upload_procedure(2);
                } else {
                    command_log('Chip not supported, sorry :-(');
                    
                    // disconnect
                    self.upload_procedure(99);
                }
            });
            break;
        case 2:
            var erase_eeprom = $('div.erase_eeprom input').prop('checked');
            if (erase_eeprom) {
                command_log('Erasing EEPROM...');
                
                // proceed to next step
                self.upload_procedure(3);
            } else {
                command_log('Writing data ...');
                
                // jump over 1 step
                self.upload_procedure(4);
            }
            break;
        case 3:
            // erase eeprom
            if (self.eeprom_blocks_erased < 256) {
                self.send([self.command.start_block_eeprom_load, 0x00, 0x04, 0x45, 0xFF, 0xFF, 0xFF, 0xFF], 1, function(data) {
                    if (debug) console.log('AVR109 - EEPROM Erasing: 4 bytes');
                    self.eeprom_blocks_erased++;
                    
                    // wipe another block
                    self.upload_procedure(3);
                });
            } else {
                command_log('EEPROM <span style="color: green;">erased</span>');
                command_log('Writing data ...');
                
                // proceed to next step
                self.upload_procedure(4);
            }
            break;
        case 4:
            // set starting address
            self.send([self.command.set_address, 0x00, 0x00], 1, function(data) {
                if (debug) console.log('AVR109 - Setting starting address for upload to 0x00');
                
                self.upload_procedure(5);
            });
            break;
        case 5:
            // upload
            if (self.blocks_flashed < self.hex_to_flash.length) {
                if (debug) console.log('AVR109 - Writing: ' + self.hex_to_flash[self.blocks_flashed].length + ' bytes');
                
                var array_out = new Array(self.hex_to_flash[self.blocks_flashed].length + 4); // 4 byte overhead
                
                array_out[0] = self.command.start_block_flash_load;
                array_out[1] = 0x00; // length High byte
                array_out[2] = self.hex_to_flash[self.blocks_flashed].length;
                array_out[3] = 0x46; // F (writing to flash)
                
                for (var i = 0; i < self.hex_to_flash[self.blocks_flashed].length; i++) {
                    array_out[i + 4] = self.hex_to_flash[self.blocks_flashed][i]; // + 4 bytes because of protocol overhead
                }

                self.send(array_out, 1, function(data) {
                    self.blocks_flashed++;
                    
                    // flash another block
                    self.upload_procedure(5);
                });
            } else {
                command_log('Writing <span style="color: green;">done</span>');
                command_log('Verifying data ...');
                
                // proceed to next step
                self.upload_procedure(6);
            }
            break;
        case 6:
            // set starting address
            self.send([self.command.set_address, 0x00, 0x00], 1, function(data) {
                if (debug) console.log('AVR109 - Setting starting address for verify to 0x00');
                self.upload_procedure(7);
            });
            break;
        case 7:
            // verify
            if (self.blocks_read < self.hex_to_flash.length) {
                var block_length = self.hex_to_flash[self.blocks_read].length; // block length saved in its own variable to avoid "slow" traversing/save clock cycles
                if (debug) console.log('AVR109 - Reading: ' + block_length + ' bytes');
                
                self.send([0x67, 0x00, block_length, 0x46], block_length, function(data) {
                    var verified = self.verify_flash(self.hex_to_flash[self.blocks_read++], data);
                    
                    if (!verified) {
                        command_log('Verifying <span style="color: red;">failed</span>');
                        command_log('Programming: <span style="color: red;">FAILED</span>');
                        
                        // jump to next step
                        self.upload_procedure(8);
                    }
                    
                    // verify another block
                    self.upload_procedure(7);
                });
            } else {     
                command_log('Verifying <span style="color: green;">done</span>');
                command_log('Programming: <span style="color: green;">SUCCESSFUL</span>');
            
                // proceed to next step
                self.upload_procedure(8);
            }
            break;
        case 8:
            // leave bootloader
            self.send([self.command.exit_bootloader], 1, function(data) { // E
                if (debug) console.log('AVR109 - Leaving Bootloader');
                
                self.upload_procedure(99);
            });
            break;
        case 99:
            // exit
            GUI.interval_remove('firmware_uploader_read'); // stop reading serial
            GUI.interval_remove('AVR109_timeout'); // stop AVR109 timeout timer (everything is finished now)
            
            if (debug) console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');
            if (debug) console.log('Script finished after: ' + self.steps_executed + ' steps');
            
            // close connection
            chrome.serial.close(connectionId, function(result) { 
                if (result) { // All went as expected
                    if (debug) console.log('AVR109 - Connection closed successfully.');
                    command_log('<span style="color: green">Successfully</span> closed serial connection');
                    
                    connectionId = -1; // reset connection id
                } else { // Something went wrong
                    if (connectionId > 0) {
                        if (debug) console.log('AVR109 - There was an error that happened during "connection-close" procedure');
                        command_log('<span style="color: red">Failed</span> to close serial port');
                    } 
                }
                
                // unlocking connect button
                GUI.connect_lock = false;
            });
            break;
    };
};

// initialize object
var AVR109 = new AVR109_protocol();
var AVR109_protocol = function() {
    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;
    
    this.bytes_to_read; // ref
    this.read_callback; // ref
    
    this.blocks_flashed = 0;
    this.eeprom_blocks_erased = 0;
    
    this.flash_to_hex_received = new Array();
    
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

AVR109_protocol.prototype.begin_read = function() {
    var self = this;
    
    GUI.interval_add('firmware_uploader_read', function() {
        self.read();
    }, 1); // every 1 ms
};

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

AVR109_protocol.prototype.verify_flash = function(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        for (var inner = 0; inner < first_array[i]; inner++) {
            if (first_array[i][inner] != second_array[i][inner]) {
                return false;
            }
        }
    }
    
    return true;
};

// initialize object
var AVR109 = new AVR109_protocol();

function avr109_upload_procedure(step) {
    switch (step) {
        case 0:
            // initialize
            AVR109.begin_read();
            
            avr109_upload_procedure(1);
            break;
        case 1:
            // Request device signature
            AVR109.send([0x73], 3, function(data) { // s
                if (verify_chip_signature(data[2], data[1], data[0])) {
                    // proceed to next step
                    avr109_upload_procedure(2);
                } else {
                    command_log('Chip not supported, sorry :-(');
                    
                    // disconnect
                    avr109_upload_procedure(2);
                }
                
            });
            break;
        case 2:
            var erase_eeprom = $('div.erase_eeprom input').prop('checked');
            if (erase_eeprom) {
                command_log('Erasing EEPROM...');
                
                // proceed to next step
                avr109_upload_procedure(3);
            } else {
                command_log('Writing data ...');
                
                // jump over 1 step
                avr109_upload_procedure(4);
            }
            break;
        case 3:
            // erase eeprom
            if (AVR109.eeprom_blocks_erased < 256) {
                AVR109.send([0x42, 0x00, 0x04, 0x45, 0xFF, 0xFF, 0xFF, 0xFF], 1, function(data) {
                    if (debug) console.log('EEPROM Erasing: 4 bytes');
                    AVR109.eeprom_blocks_erased++;
                    
                    // wipe another block
                    avr109_upload_procedure(3);
                });
            } else {
                command_log('EEPROM <span style="color: green;">erased</span>');
                command_log('Writing data ...');
                
                // reset variables
                AVR109.eeprom_blocks_erased = 0;
                
                // proceed to next step
                avr109_upload_procedure(4);
            }
            break;
        case 4:
            // set starting address
            AVR109.send([0x41, 0x00, 0x00], 1, function(data) { // A
                avr109_upload_procedure(5);
            });
            break;
        case 5:
            // upload
            if (AVR109.blocks_flashed < uploader_hex_to_flash_parsed.length) {
                if (debug) console.log('Writing: ' + uploader_hex_to_flash_parsed[AVR109.blocks_flashed].length + ' bytes');
                
                var array_out = new Array(uploader_hex_to_flash_parsed[AVR109.blocks_flashed].length + 4); // 4 byte overhead
                
                array_out[0] = 0x42; // B
                array_out[1] = 0x00; // length High byte
                array_out[2] = uploader_hex_to_flash_parsed[AVR109.blocks_flashed].length;
                array_out[3] = 0x46; // F (writing to flash)
                
                for (var i = 0; i < uploader_hex_to_flash_parsed[AVR109.blocks_flashed].length; i++) {
                    array_out[i + 4] = uploader_hex_to_flash_parsed[AVR109.blocks_flashed][i]; // + 4 bytes because of protocol overhead
                }

                AVR109.send(array_out, 1, function(data) {
                    AVR109.blocks_flashed++;
                    
                    // flash another block
                    avr109_upload_procedure(5);
                });
            } else {
                command_log('Writing <span style="color: green;">done</span>');
                command_log('Verifying data ...');
                
                // reset variables
                AVR109.blocks_flashed = 0;
                
                avr109_upload_procedure(6);
            }
            break;
        case 6:
            // set starting address
            AVR109.send([0x41, 0x00, 0x00], 1, function(data) { // A
                avr109_upload_procedure(7);
            });
            break;
        case 7:
            // verify
            if (AVR109.blocks_flashed < uploader_hex_to_flash_parsed.length) {
                var block_length = uploader_hex_to_flash_parsed[AVR109.blocks_flashed].length; // block length saved in its own variable to avoid "slow" traversing/save clock cycles
                
                AVR109.send([0x67, 0x00, block_length, 0x46], block_length, function(data) {
                    if (debug) console.log('Read: ' + block_length + ' bytes');
                    
                    AVR109.flash_to_hex_received[AVR109.blocks_flashed] = data;
                    AVR109.blocks_flashed++;
                    
                    // verify another block
                    avr109_upload_procedure(7);
                });
            } else {
                var result = AVR109.verify_flash(uploader_hex_to_flash_parsed, AVR109.flash_to_hex_received);
                
                if (result) {
                    command_log('Verifying <span style="color: green;">done</span>');
                    command_log('Programming: <span style="color: green;">SUCCESSFUL</span>');
                } else {
                    command_log('Verifying <span style="color: red;">failed</span>');
                    command_log('Programming: <span style="color: red;">FAILED</span>');
                }

                avr109_upload_procedure(8);
            }
            break;
        case 8:
            // leave bootloader
            AVR109.send([0x45], 1, function(data) { // E
                if (debug) console.log('Leaving Bootloader');
                
                avr109_upload_procedure(99);
            });
            break;
        case 99:
            // exit
            GUI.interval_remove('firmware_uploader_read'); // stop reading serial
            
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
    };
}
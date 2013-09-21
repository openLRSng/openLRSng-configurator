var STM32_protocol = function() {
    this.hex_to_flash; // data to flash
    
    this.receive_buffer;
    
    this.bytes_to_read = 0; // ref
    this.read_callback; // ref

    this.bytes_flashed;
    this.bytes_verified;

    this.verify_hex = new Array();
    
    this.upload_time_start;
    
    this.status = {
        ACK:    0x79,
        NACK:   0x1F
    };
    
    this.command = {
        get:                    0x00, // Gets the version and the allowed commands supported by the current version of the bootloader
        get_ver_r_protect_s:    0x01, // Gets the bootloader version and the Read Protection status of the Flash memory
        get_ID:                 0x02, // Gets the chip ID
        read_memory:            0x11, // Reads up to 256 bytes of memory starting from an address specified by the application
        go:                     0x21, // Jumps to user application code located in the internal Flash memory or in SRAM
        write_memory:           0x31, // Writes up to 256 bytes to the RAM or Flash memory starting from an address specified by the application
        erase:                  0x43, // Erases from one to all the Flash memory pages
        extended_erase:         0x44, // Erases from one to all the Flash memory pages using two byte addressing mode (v3.0+ usart).
        write_protect:          0x63, // Enables the write protection for some sectors
        write_unprotect:        0x73, // Disables the write protection for all Flash memory sectors
        readout_protect:        0x82, // Enables the read protection
        readout_unprotect:      0x92  // Disables the read protection
    };
    
    // Erase (x043) and Extended Erase (0x44) are exclusive. A device may support either the Erase command or the Extended Erase command but not both.
};

STM32_protocol.prototype.connect = function() {
    var self = this;
    
    selected_port = String($('div#port-picker .port select').val());
    
    if (selected_port != '0') {
        chrome.serial.open(selected_port, {bitrate: 115200}, function(openInfo) {
            connectionId = openInfo.connectionId;
            
            if (connectionId != -1) {       
                if (debug) console.log('Connection was opened with ID: ' + connectionId);
                command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);

                // we are connected, disabling connect button in the UI
                GUI.connect_lock = true;
                
                // start the upload procedure
                self.initialize();
            }
        });
    } else {
        command_log('Please select valid serial port');
    }
};

STM32_protocol.prototype.initialize = function() {
    var self = this;
    
    // reset and set some variables before we start 
    self.receive_buffer = [];
    self.bytes_flashed = 0;
    self.bytes_verified = 0;

    self.verify_hex = [];
    
    self.upload_time_start = microtime();

    GUI.interval_add('firmware_uploader_read', function() {
        self.read();
    }, 1, true);

    // first step
    self.upload_procedure(1);
};

// no input parameters
// this method should be executed every 1 ms via interval timer
STM32_protocol.prototype.read = function() {
    var self = this;
    
    // routine that fills the buffer
    chrome.serial.read(connectionId, 128, function(readInfo) {
        if (readInfo && readInfo.bytesRead > 0) { 
            var data = new Uint8Array(readInfo.data);
            
            for (var i = 0; i < data.length; i++) {
                self.receive_buffer.push(data[i]);  
                console.log(data[i]); // debug only !!!
            }
        }
    });
    
    // routine that fetches data from buffer if statement is true
    if (self.receive_buffer.length >= self.bytes_to_read && self.bytes_to_read != 0) {
        var data = self.receive_buffer.slice(0, self.bytes_to_read); // bytes requested
        self.receive_buffer.splice(0, self.bytes_to_read); // remove read bytes
        
        self.bytes_to_read = 0; // reset trigger
        
        self.read_callback(data);
    }
};

// Array = array of bytes that will be send over serial
// bytes_to_read = received bytes necessary to trigger read_callback
// callback = function that will be executed after received bytes = bytes_to_read
STM32_protocol.prototype.send = function(Array, bytes_to_read, callback) {
    var bufferOut = new ArrayBuffer(Array.length);
    var bufferView = new Uint8Array(bufferOut);
    
    // set Array values inside bufferView (alternative to for loop)
    bufferView.set(Array);
    
    // update references
    this.bytes_to_read = bytes_to_read;
    this.read_callback = callback; 

    // send over the actual data
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {}); 
};

// patter array = [[byte position in response, value], n]
// data = response of n bytes from mcu
// result = true/false
STM32_protocol.prototype.verify_response = function(pattern, data) {
    var valid = true;
    
    for (var i = 0; i < pattern.length; i++) {
        // pattern[key][value] != data[pattern_key]
        if (pattern[i][1] != data[pattern[i][0]]) {
            valid = false;
        }         
    }
    
    if (!valid) {
        if (debug) console.log('STM32 Communication failed, wrong response, expected: ' + pattern + ' received: ' + data);
        command_log('STM32 Communication <span style="color: red">Failed</span>');
        
        // disconnect
        this.upload_procedure(99);
        
        return false;
    }
    
    return true;
};

// first_array = usually hex_to_flash array
// second_array = usually verify_hex array
// result = true/false
STM32_protocol.prototype.verify_flash = function(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        if (first_array[i] != second_array[i]) {
            if (debug) console.log('Verification failed on byte: ' + i + ' expected: ' + first_array[i] + ' received: ' + second_array[i]);
            return false;
        }
    }
    
    if (debug) console.log('Verification successful, matching: ' + first_array.length + ' bytes');
    
    return true;
};

// step = value depending on current state of upload_procedure
STM32_protocol.prototype.upload_procedure = function(step) {
    var self = this;
    
    switch (step) {
        case 1:
            // initialize serial interface on the MCU side, auto baud rate settings
            self.send([0x7F], 1, function(data) {
                if (self.verify_response([[0, self.status.ACK]], data)) {
                    if (debug) console.log('STM32 - Serial interface initialized on the MCU side');
                    
                    // proceed to next step
                    self.upload_procedure(2);
                }
            });
            break;
        case 2:
            // get version of the bootloader and supported commands
            self.send([self.command.get, 0x00, 0xFF], 2, function(data) {                
                if (self.verify_response([[0, self.status.ACK]], data)) {
                    self.send([], data[1] + 2, function(data) {  // data[1] = byte 2 = number of bytes that will follow (should be 11 + ack), its 12 + ack, WHY ???
                        if (debug) console.log('STM32 - Bootloader version: ' + (parseInt(data[0].toString(16)) / 10).toFixed(1)); // convert dec to hex, hex to dec and add floating point
                        
                        // proceed to next step
                        self.upload_procedure(3);
                    });
                }
            });
            
            break;
        case 3:
            // proceed to next step
            self.upload_procedure(99);
            break;
        case 99:
            // disconnect
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
    }
};

// initialize object
var STM32 = new STM32_protocol();
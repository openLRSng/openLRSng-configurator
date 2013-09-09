var AVR109_protocol = function() {
    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;
    
    this.bytes_to_read; // ref
    this.read_callback; // ref
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
            AVR109.send([0x65], 1, function(data) { // e
                command_log('EEPROM <span style="color: green;">erased</span>');
                command_log('Writing data ...');
                
                avr109_upload_procedure(4);
            });
            break;
        case 4:
            // set starting address
            AVR109.send([0x41, 0x00, 0x00], 1, function(data) { // A
                avr109_upload_procedure(5);
            });
            break;
        case 5:
            // upload
            //avr109_upload_procedure(6);
            break;
        case 6:
            // verify
            break;
        case 7:
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
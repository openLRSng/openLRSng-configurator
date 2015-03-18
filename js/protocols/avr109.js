'use strict';

var AVR109_protocol = function () {
    this.hex; // ref
    this.verify_hex;

    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;

    this.bytes_to_read = 0; // ref
    this.read_callback; // ref

    this.upload_time_start;
    this.upload_process_alive;

    this.debug = false;

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

// no input parameters
AVR109_protocol.prototype.connect = function (hex) {
    var self = this;
    self.hex = hex;

    var selected_port = String($('div#port-picker .port select').val());

    // connect & disconnect at 1200 baud rate so atmega32u4 jumps into bootloader mode and connect with a new port
    if (selected_port != '0') {
        serial.connect(selected_port, {bitrate: 1200}, function (openInfo) {
            if (openInfo) {
                // we connected succesfully, we will disconnect now
                serial.disconnect(function (result) {
                    if (result) {
                        // disconnected succesfully, now we will wait/watch for new serial port to appear
                        console.log('AVR109 - Waiting for programming port to connect');
                        GUI.log(chrome.i18n.getMessage('avr109_waiting_for_programming_port'));

                        PortHandler.port_detected('AVR109_new_port_search', function (new_ports) {
                            if (new_ports) {
                                console.log('AVR109 - New port found: ' + new_ports[0]);
                                GUI.log(chrome.i18n.getMessage('avr109_new_port_found', [new_ports[0]]));

                                GUI.timeout_add('initialization_timeout', function () {
                                    serial.connect(new_ports[0], {bitrate: 57600}, function (openInfo) {
                                        if (openInfo) {
                                            GUI.log(chrome.i18n.getMessage('serial_port_opened', [openInfo.connectionId]));

                                            // we are connected, disabling connect button in the UI
                                            GUI.connect_lock = true;

                                            // start the upload procedure
                                            self.initialize();
                                        } else {
                                            GUI.log(chrome.i18n.getMessage('error_failed_to_open_port'));
                                        }
                                    });
                                }, 100); // timeout so bus have time to initialize after being detected by the system
                            } else {
                                console.log('AVR109 - Port not found within 8 seconds');
                                console.log('AVR109 - Upload failed');
                                GUI.log(chrome.i18n.getMessage('avr109_new_port_not_found'));
                                GUI.log(chrome.i18n.getMessage('avr109_upload_failed'));
                            }
                        }, 8000);
                    } else {
                        console.log('AVR109 - Failed to close connection');
                        GUI.log(chrome.i18n.getMessage('error_failed_to_close_port'));
                    }
                });
            } else {
                console.log('AVR109 - Failed to open connection');
                GUI.log(chrome.i18n.getMessage('error_failed_to_open_port'));
            }
        });
    } else {
        GUI.log(chrome.i18n.getMessage('error_no_valid_port'));
    }
};

// initialize certain variables and start timers that oversee the communication
AVR109_protocol.prototype.initialize = function () {
    var self = this;

    // reset and set some variables before we start
    self.verify_hex = [];

    self.upload_time_start = microtime();
    self.upload_process_alive = false;

    serial.onReceive.addListener(function (info) {
        self.read(info);
    });

    GUI.interval_add('AVR109_timeout', function () {
        if (self.upload_process_alive) { // process is running
            self.upload_process_alive = false;
        } else {
            console.log('AVR109 timed out, programming failed ...');
            GUI.log(chrome.i18n.getMessage('avr109_timed_out'));

            // protocol got stuck, clear timer and disconnect
            GUI.interval_remove('AVR109_timeout');

            // exit
            self.upload_procedure(99);
        }
    }, 1000);

    self.upload_procedure(1);
};

AVR109_protocol.prototype.verify_chip_signature = function (high, mid, low) {
    var available_flash_size = 0;

    if (high == 0x1E) { // atmega
        if (mid == 0x95) {
            if (low == 0x87) {
                // 32u4
                GUI.log(chrome.i18n.getMessage('avr109_chip_recognized_as', ['ATmega32U4 (Leonardo)']));
                available_flash_size = 28672;
            }
        }
    }

    if (available_flash_size > 0) {
        if (this.hex.bytes_total < available_flash_size) {
            return true;
        } else {
            GUI.log(chrome.i18n.getMessage('avr109_hex_too_big', [this.hex.bytes_total, available_flash_size]));

            return false;
        }
    }

    // if we dropped over here, chip is not supported
    GUI.log(chrome.i18n.getMessage('avr109_chip_not_supported'));

    return false;
};

// no input parameters
// this method should be executed every 1 ms via interval timer
AVR109_protocol.prototype.read = function (readInfo) {
    var self = this;
    var data = new Uint8Array(readInfo.data);

    for (var i = 0; i < data.length; i++) {
        self.receive_buffer[self.receive_buffer_i++] = data[i];

        if (self.receive_buffer_i == self.bytes_to_read) {
            self.read_callback(self.receive_buffer); // callback with buffer content
        }
    }
};

// Array = array of bytes that will be send over serial
// bytes_to_read = received bytes necessary to trigger read_callback
// callback = function that will be executed after received bytes = bytes_to_read
AVR109_protocol.prototype.send = function (Array, bytes_to_read, callback) {
    // flip flag
    this.upload_process_alive = true;

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
    serial.send(bufferOut);
};

// patter array = [[byte position in response, value], n]
// data = response of n bytes from mcu
// result = true/false
AVR109_protocol.prototype.verify_response = function (pattern, data) {
    var valid = true;

    for (var i = 0; i < pattern.length; i++) {
        // pattern[key][value] != data[pattern_key]
        if (pattern[i][1] != data[pattern[i][0]]) {
            valid = false;
        }
    }

    if (!valid) {
        console.log('AVR109 Communication failed, wrong response, expected: ' + pattern + ' received: ' + data);
        GUI.log(chrome.i18n.getMessage('avr109_communication_failed'));

        // disconnect
        this.upload_procedure(99);

        return false;
    }

    return true;
};

// first_array = one block of flash data
// second_array = one block of received flash data through serial
// return = true/false
AVR109_protocol.prototype.verify_flash = function (first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        if (first_array[i] != second_array[i]) {
            console.log('Verification failed on byte: ' + i + ' expected: ' + first_array[i] + ' received: ' + second_array[i]);
            return false;
        }
    }

    console.log('Verification successful, matching: ' + first_array.length + ' bytes');

    return true;
};

// step = value depending on current state of upload_procedure
AVR109_protocol.prototype.upload_procedure = function (step) {
    var self = this;

    switch (step) {
        case 1:
            // Request device signature
            self.send([self.command.read_signature_bytes], 3, function (data) {
                if (self.debug) console.log('AVR109 - Requesting signature: ' + data);

                if (self.verify_chip_signature(data[2], data[1], data[0])) {
                    // proceed to next step
                    self.upload_procedure(2);
                } else {
                    // disconnect
                    self.upload_procedure(99);
                }
            });
            break;
        case 2:
            var erase_eeprom = $('div.erase_eeprom input').prop('checked');
            if (erase_eeprom) {
                console.log('AVR109 - Erasing EEPROM');
                GUI.log(chrome.i18n.getMessage('avr109_erasing_eeprom'));

                // proceed to next step
                self.upload_procedure(3);
            } else {
                console.log('AVR109 - Writing to flash');
                GUI.log(chrome.i18n.getMessage('avr109_writing_to_flash'));

                // jump over 1 step
                self.upload_procedure(4);
            }
            break;
        case 3:
            // erase eeprom
            var eeprom_blocks_erased = 0;

            var erase = function() {
                if (eeprom_blocks_erased < 256) {
                    self.send([self.command.start_block_eeprom_load, 0x00, 0x04, 0x45, 0xFF, 0xFF, 0xFF, 0xFF], 1, function(data) {
                        if (self.verify_response([[0, 0x0D]], data)) {
                            if (self.debug) console.log('AVR109 - EEPROM Erasing: 4 bytes');
                            eeprom_blocks_erased++;

                            // wipe another block
                            erase();
                        }
                    });
                } else {
                    console.log('AVR109 - Writing to flash');
                    GUI.log(chrome.i18n.getMessage('avr109_writing_to_flash'));

                    // proceed to next step
                    self.upload_procedure(4);
                }
            };

            // start erasing
            erase();
            break;
        case 4:
            // flash
            var blocks = self.hex.data.length - 1;
            var flashing_block = 0;
            var bytes_flashed = 0;
            var flashing_memory_address = self.hex.data[flashing_block].address;

            var write = function () {
                if (bytes_flashed >= self.hex.data[flashing_block].bytes) {
                    // move to another block
                    if (flashing_block < blocks) {
                        flashing_block++;
                        bytes_flashed = 0;
                        flashing_memory_address = self.hex.data[flashing_block].address;

                        self.send([self.command.set_address, (flashing_memory_address >> 8), (flashing_memory_address & 0x00FF)], 1, function(data) {
                            if (self.verify_response([[0, 0x0D]], data)) {
                                if (self.debug) console.log('AVR109 - Setting address to ' + flashing_memory_address);

                                write();
                            }
                        });
                    } else {
                        console.log('AVR109 - Verifying flash');
                        GUI.log(chrome.i18n.getMessage('avr109_verifying_flash'));

                        // proceed to next step
                        self.upload_procedure(5);
                    }
                } else {
                    var bytes_to_write;
                    if ((bytes_flashed + 128) <= self.hex.data[flashing_block].bytes) {
                        bytes_to_write = 128;
                    } else {
                        bytes_to_write = self.hex.data[flashing_block].bytes - bytes_flashed;
                    }

                    if (self.debug) console.log('AVR109 - Writing: ' + flashing_memory_address + ' - ' + (flashing_memory_address + bytes_to_write));

                    var array_out = new Array(bytes_to_write + 4); // 4 byte overhead

                    array_out[0] = self.command.start_block_flash_load;
                    array_out[1] = 0x00; // length High byte
                    array_out[2] = bytes_to_write;
                    array_out[3] = 0x46; // F (writing to flash)

                    for (var i = 0; i < bytes_to_write; i++) {
                        array_out[i + 4] = self.hex.data[flashing_block].data[bytes_flashed++]; // + 4 bytes because of protocol overhead
                    }

                    self.send(array_out, 1, function (data) {
                        if (self.verify_response([[0, 0x0D]], data)) {
                            flashing_memory_address += bytes_to_write

                            // flash another page
                            write();
                        }
                    });
                }
            }

            // set starting address
            self.send([self.command.set_address, (flashing_memory_address >> 8), (flashing_memory_address & 0x00FF)], 1, function (data) {
                if (self.verify_response([[0, 0x0D]], data)) {
                    if (self.debug) console.log('AVR109 - Setting starting address for upload to ' + flashing_memory_address);

                    // start writing
                    write();
                }
            });
            break;
        case 5:
            // verify
            var blocks = self.hex.data.length - 1;
            var reading_block = 0;
            var bytes_verified = 0;
            var verifying_memory_address = self.hex.data[reading_block].address;

            // initialize arrays
            for (var i = 0; i <= blocks; i++) {
                self.verify_hex.push([]);
            }

            var reading = function () {
                if (bytes_verified >= self.hex.data[reading_block].bytes) {
                    // move to another block
                    if (reading_block < blocks) {
                        reading_block++;
                        bytes_verified = 0;
                        verifying_memory_address = self.hex.data[reading_block].address;

                        self.send([self.command.set_address, (verifying_memory_address >> 8), (verifying_memory_address & 0x00FF)], 1, function (data) {
                            if (self.verify_response([[0, 0x0D]], data)) {
                                if (self.debug) console.log('AVR109 - Setting address to ' + verifying_memory_address);

                                reading();
                            }
                        });
                    } else {
                        // all blocks read, verify
                        var verify = true;
                        for (var i = 0; i <= blocks; i++) {
                            verify = self.verify_flash(self.hex.data[i].data, self.verify_hex[i]);

                            if (!verify) break;
                        }

                        if (verify) {
                            GUI.log(chrome.i18n.getMessage('avr109_verify_ok'));
                            GUI.log(chrome.i18n.getMessage('avr109_programming_ok'));
                        } else {
                            GUI.log(chrome.i18n.getMessage('avr109_verify_fail'));
                            GUI.log(chrome.i18n.getMessage('avr109_programming_fail'));
                        }

                        // proceed to next step
                        self.upload_procedure(6);
                    }
                } else {
                    var bytes_to_read;
                    if ((bytes_verified + 128) <= self.hex.data[reading_block].bytes) {
                        bytes_to_read = 128;
                    } else {
                        bytes_to_read = self.hex.data[reading_block].bytes - bytes_verified;
                    }

                    if (self.debug) console.log('AVR109 - Reading: ' + verifying_memory_address + ' - ' + (verifying_memory_address + bytes_to_read));

                    self.send([0x67, 0x00, bytes_to_read, 0x46], bytes_to_read, function (data) {
                        for (var i = 0; i < data.length; i++) {
                            self.verify_hex[reading_block].push(data[i]);
                            bytes_verified++;
                        }

                        verifying_memory_address += bytes_to_read;

                        // verify another page
                        reading();
                    });
                }
            }

            // set starting address
            self.send([self.command.set_address, (verifying_memory_address >> 8), (verifying_memory_address & 0x00FF)], 1, function (data) {
                if (self.verify_response([[0, 0x0D]], data)) {
                    if (self.debug) console.log('AVR109 - Setting starting address for verify to ' + verifying_memory_address);

                    // start reading
                    reading();
                }
            });
            break;
        case 6:
            // leave bootloader
            self.send([self.command.exit_bootloader], 1, function (data) {
                if (self.verify_response([[0, 0x0D]], data)) {
                    if (self.debug) console.log('AVR109 - Leaving Bootloader');

                    self.upload_procedure(99);
                }
            });
            break;
        case 99:
            // exit
            GUI.interval_remove('AVR109_timeout'); // stop AVR109 timeout timer (everything is finished now)

            console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');

            // close connection
            serial.disconnect(function (result) {
                if (result) { // All went as expected
                    GUI.log(chrome.i18n.getMessage('serial_port_closed'));
                } else { // Something went wrong
                    GUI.log(chrome.i18n.getMessage('error_failed_to_close_port'));
                }
            });

            // unlocking connect button
            // if flashing dropped out to this routine due to an error, calling .disconnect can have no effect, so connect lock will be cleared either way
            GUI.connect_lock = false;
            break;
    };
};

// initialize object
var AVR109 = new AVR109_protocol();
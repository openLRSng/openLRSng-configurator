var STK500_protocol = function() {
    this.hex; // ref
    this.verify_hex;

    this.receive_buffer = new Array();
    this.receive_buffer_i = 0;

    this.bytes_to_read = 0; // ref
    this.read_callback; // ref

    this.upload_time_start;
    this.upload_process_alive;

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

// no input parameters
STK500_protocol.prototype.connect = function(hex) {
    var self = this;
    self.hex = hex;

    var selected_port = String($('div#port-picker .port select').val());

    if (selected_port != '0') {
        serial.connect(selected_port, {bitrate: 57600}, function(openInfo) {
            if (openInfo) {
                GUI.log('Connection <span style="color: green">successfully</span> opened with ID: ' + openInfo.connectionId);

                // we are connected, disabling connect button in the UI
                GUI.connect_lock = true;

                // start the upload procedure
                self.initialize();
            } else {
                GUI.log('<span style="color: red">Failed</span> to open serial port');
            }
        });
    } else {
        GUI.log('Please select valid serial port');
    }
};

// initialize certain variables and start timers that oversee the communication
STK500_protocol.prototype.initialize = function() {
    var self = this;

    // reset and set some variables before we start
    self.verify_hex = [];

    self.upload_time_start = microtime();
    self.upload_process_alive = false;

    serial.onReceive.addListener(function(info) {
        self.read(info);
    });

    var upload_procedure_retry = 0;

    if (debug) {
        if (GUI.use_rts) console.log('Sending RTS command ...');
        else console.log('Sending DTR command ...');
    }

    var options = {};
    if (GUI.use_rts) options.rts = true;
    else options.dtr = true;

    serial.setControlSignals(options, function(result) {
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
                        if (self.upload_process_alive) { // process is running
                            self.upload_process_alive = false;
                        } else {
                            if (debug) console.log('STK500 timed out, programming failed ...');
                            GUI.log('STK500 timed out, programming <span style="color: red">failed</span> ...');

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

                GUI.log('Connection to the module <span style="color: red">failed</span>');
                if (debug) console.log('Connection to the module failed');

                // exit
                self.upload_procedure(99);
            }
        }, 100);
    });
};

STK500_protocol.prototype.verify_chip_signature = function(high, mid, low) {
    var available_flash_size = 0;

    if (high == 0x1E) { // atmega
        if (mid == 0x95) {
            if (low == 0x14) {
                // 328
                GUI.log('Chip recognized as ATmega328');
                available_flash_size = 30720;
            } else if (low == 0x0F) {
                // 328P
                GUI.log('Chip recognized as ATmega328P');
                available_flash_size = 30720;
            }
        }
    }

    if (available_flash_size > 0) {
        if (this.hex.bytes_total < available_flash_size) {
            return true;
        } else {
            GUI.log('Supplied hex is bigger then flash available on the chip, HEX: ' + this.hex.bytes_total + ' bytes, limit = ' + available_flash_size + ' bytes');

            return false;
        }
    }

    GUI.log('Chip not supported, sorry :-(');

    return false;
};

// no input parameters
// this method should be executed every 1 ms via interval timer
// (cant use "slower" timer because standard arduino bootloader uses 16ms command timeout)
STK500_protocol.prototype.read = function(readInfo) {
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
STK500_protocol.prototype.send = function(Array, bytes_to_read, callback) {
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
    serial.send(bufferOut, function(writeInfo) {});
};

// pattern array = [[byte position in response, value], n]
// data = response of n bytes from mcu
// result = true/false
STK500_protocol.prototype.verify_response = function(pattern, data) {
    var valid = true;

    for (var i = 0; i < pattern.length; i++) {
        // pattern[key][value] != data[pattern_key]
        if (pattern[i][1] != data[pattern[i][0]]) {
            valid = false;
        }
    }

    if (!valid) {
        if (debug) console.log('STK500 Communication failed, wrong response, expected: ' + pattern + ' received: ' + data);
        GUI.log('STK500 Communication <span style="color: red">Failed</span>');

        // disconnect
        this.upload_procedure(99);

        return false;
    }

    return true;
};

// first_array = usually hex_to_flash array
// second_array = usually verify_hex array
// result = true/false
STK500_protocol.prototype.verify_flash = function(first_array, second_array) {
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
STK500_protocol.prototype.upload_procedure = function(step) {
    var self = this;

    switch (step) {
        case 1:
            // read device signature (3 bytes)
            self.send([self.command.Cmnd_STK_READ_SIGN, self.command.Sync_CRC_EOP], 5, function(data) {
                if (debug) console.log('Requesting device signature - ' + data);

                if (self.verify_response([[0, self.command.Resp_STK_INSYNC], [4, self.command.Resp_STK_OK]], data)) {
                    // we need to verify chip signature
                    if (self.verify_chip_signature(data[1], data[2], data[3])) {
                        var erase_eeprom = $('div.erase_eeprom input').prop('checked');

                        if (erase_eeprom) {
                            GUI.log('Erasing EEPROM...');

                            // proceed to next step
                            self.upload_procedure(2);
                        } else {
                            GUI.log('Writing data ...');

                            // jump over 1 step
                            self.upload_procedure(3);
                        }

                    } else {
                        // disconnect
                        self.upload_procedure(99);
                    }
                }
            });
            break;
        case 2:
            // erase eeprom
            var address = 0;
            var bytes_flashed = 0;

            var erase = function() {
                var bytes_to_flash = ((bytes_flashed + 4) < 1024) ? 4 : (1024 - bytes_flashed);

                if (bytes_to_flash > 0) {
                    self.send([self.command.Cmnd_STK_LOAD_ADDRESS, (address & 0x00FF), (address >> 8), self.command.Sync_CRC_EOP], 2, function(data) {
                        if (self.verify_response([[0, self.command.Resp_STK_INSYNC], [1, self.command.Resp_STK_OK]], data)) {
                            if (debug) console.log('STK500 - Erasing: ' + address);

                            var arr = [];
                            arr[0] = self.command.Cmnd_STK_PROG_PAGE;
                            arr[1] = 0x00; // MSB
                            arr[2] = bytes_to_flash; // LSB
                            arr[3] = 0x45; // eeprom

                            for (var i = 0; i < bytes_to_flash; i++) {
                                arr.push(0xFF);
                            }
                            arr.push(self.command.Sync_CRC_EOP);

                            self.send(arr, 2, function(data) {
                                address += bytes_to_flash / 2; // 2 bytes per page
                                bytes_flashed += bytes_to_flash;

                                // wipe another block
                                erase();
                            });
                        }
                    });
                } else {
                    GUI.log('EEPROM <span style="color: green;">erased</span>');
                    GUI.log('Writing data ...');

                    // proceed to next step
                    self.upload_procedure(3);
                }
            };

            // start erasing
            erase();
            break;
        case 3:
            // flash
            var blocks = self.hex.data.length - 1;
            var flashing_block = 0;
            var bytes_flashed = 0;
            var address = self.hex.data[flashing_block].address;

            var write = function() {
                if (bytes_flashed >= self.hex.data[flashing_block].bytes) {
                    // move to another block
                    if (flashing_block < blocks) {
                        flashing_block++;

                        address = self.hex.data[flashing_block].address;
                        bytes_flashed = 0;

                        write();
                    } else {
                        // all blocks flashed
                        GUI.log('Writing <span style="color: green;">done</span>');
                        GUI.log('Verifying data ...');

                        // proceed to next step
                        self.upload_procedure(4);
                    }
                } else {
                    // memory block address seems to increment by 64 for each block (probably because of 64 words per page (total of 256 pages), 1 word = 2 bytes)
                    self.send([self.command.Cmnd_STK_LOAD_ADDRESS, (address & 0x00FF), (address >> 8), self.command.Sync_CRC_EOP], 2, function(data) {
                        if (self.verify_response([[0, self.command.Resp_STK_INSYNC], [1, self.command.Resp_STK_OK]], data)) {
                            if (debug) console.log('STK500 - Writing to: ' + address);

                            var bytes_to_write = ((bytes_flashed + 128) <= self.hex.data[flashing_block].bytes) ? 128 : (self.hex.data[flashing_block].bytes - bytes_flashed);

                            var array_out = new Array(bytes_to_write + 5); // 5 byte overhead
                            array_out[0] = self.command.Cmnd_STK_PROG_PAGE;
                            array_out[1] = 0x00; // high byte length
                            array_out[2] = bytes_to_write; // low byte length
                            array_out[3] = 0x46; // F = flash memory
                            array_out[array_out.length - 1] = self.command.Sync_CRC_EOP;

                            for (var i = 0; i < bytes_to_write; i++) {
                                array_out[i + 4] = self.hex.data[flashing_block].data[bytes_flashed++]; // + 4 bytes because of protocol overhead
                            }

                            self.send(array_out, 2, function(data) {
                                address += bytes_to_write / 2; // 2 bytes per page

                                // flash another page
                                write();
                            });
                        }
                    });
                }
            };

            // start writing
            write();
            break;
        case 4:
            // verify
            var blocks = self.hex.data.length - 1;
            var reading_block = 0;
            var bytes_verified = 0;
            var address = self.hex.data[reading_block].address;

            // initialize arrays
            for (var i = 0; i <= blocks; i++) {
                self.verify_hex.push([]);
            }

            var reading = function() {
                if (bytes_verified >= self.hex.data[reading_block].bytes) {
                    // move to another block
                    if (reading_block < blocks) {
                        reading_block++;

                        address = self.hex.data[reading_block].address;
                        bytes_verified = 0;

                        reading();
                    } else {
                        // all blocks read, verify

                        var verify = true;
                        for (var i = 0; i <= blocks; i++) {
                            verify = self.verify_flash(self.hex.data[i].data, self.verify_hex[i]);

                            if (!verify) break;
                        }

                        if (verify) {
                            GUI.log('Verifying <span style="color: green;">done</span>');
                            GUI.log('Programming: <span style="color: green;">SUCCESSFUL</span>');
                        } else {
                            GUI.log('Verifying <span style="color: red;">failed</span>');
                            GUI.log('Programming: <span style="color: red;">FAILED</span>');
                        }

                        // proceed to next step
                        self.upload_procedure(99);
                    }
                } else {
                    self.send([self.command.Cmnd_STK_LOAD_ADDRESS, (address & 0x00FF), (address >> 8), self.command.Sync_CRC_EOP], 2, function(data) {
                        if (self.verify_response([[0, self.command.Resp_STK_INSYNC], [1, self.command.Resp_STK_OK]], data)) {
                            if (debug) console.log('STK500 - Reading from: ' + address);

                            var bytes_to_read = ((bytes_verified + 128) <= self.hex.data[reading_block].bytes) ? 128 : (self.hex.data[reading_block].bytes - bytes_verified);

                            self.send([self.command.Cmnd_STK_READ_PAGE, 0x00, bytes_to_read, 0x46, self.command.Sync_CRC_EOP], (bytes_to_read + 2), function(data) {
                                if (self.verify_response([[0, self.command.Resp_STK_INSYNC], [(data.length - 1), self.command.Resp_STK_OK]], data)) {
                                    // process & store received data
                                    data.shift(); // remove first sync byte
                                    data.pop(); // remove last sync byte

                                    for (var i = 0; i < data.length; i++) {
                                        self.verify_hex[reading_block].push(data[i]);
                                        bytes_verified++;
                                    }

                                    address += bytes_to_read / 2; // 2 bytes per page

                                    // verify another page
                                    reading();
                                }
                            });
                        }
                    });
                }
            };

            // start reading
            reading();
            break;
        case 99:
            // disconnect
            GUI.interval_remove('STK_timeout'); // stop stk timeout timer (everything is finished now)

            if (debug) console.log('Script finished after: ' + (microtime() - self.upload_time_start).toFixed(4) + ' seconds');

            // close connection
            serial.disconnect(function(result) {
                if (result) { // All went as expected
                    GUI.log('<span style="color: green">Successfully</span> closed serial connection');
                } else { // Something went wrong
                    GUI.log('<span style="color: red">Failed</span> to close serial port');
                }

                // unlocking connect button
                GUI.connect_lock = false;
            });
            break;
    }
};

// initialize object
var STK500 = new STK500_protocol();
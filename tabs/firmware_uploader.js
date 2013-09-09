function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');
    
    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.operating_mode = 2; // we are in firmware flash mode
        
        $('input[name="selected_firmware"]').change(function() {
            var val = $(this).val();

            $.get("./fw/" + val + ".hex", function(hex_string) {
                if (debug) console.log("fw/" + val + ".hex loaded into memory, parsing ...");
                command_log('HEX file loaded into memory, parsing ...');
                
                // we need to process/parse the hex file here, we can't afford to calculate this during flashing process
                uploader_hex_to_flash = hex_string;
                uploader_hex_to_flash = uploader_hex_to_flash.split("\n");
                
                // check if there is an empty line in the end of hex file, if there is, remove it
                if (uploader_hex_to_flash[uploader_hex_to_flash.length - 1] == "") {
                    uploader_hex_to_flash.pop();
                }
                
                uploader_hex_to_flash_parsed = new Array();
                var flash_block = 0; // each block = 128 bytes
                var bytes_in_block = 0;
                var bytes_in_sketch = 0; // just for info / debug purposes
                hexfile_valid = true; // if any of the crc checks failed, this variable flips to false
                for (var i = 0; i < uploader_hex_to_flash.length; i++) {
                    var byte_count = parseInt(uploader_hex_to_flash[i].substr(1, 2), 16) * 2; // each byte is represnted by two chars (* 2 to get the hex representation)
                    var address = uploader_hex_to_flash[i].substr(3, 4);
                    var record_type = parseInt(uploader_hex_to_flash[i].substr(7, 2), 16); // also converting from hex to decimal
                    var data = uploader_hex_to_flash[i].substr(9, byte_count);
                    var checksum = parseInt(uploader_hex_to_flash[i].substr(9 + byte_count, 2), 16); // also converting from hex to decimal (this is a 2's complement value)
                   
                    if (byte_count > 0) {
                        bytes_in_sketch += (byte_count / 2);
                        var crc = (byte_count / 2) + parseInt(address.substr(0, 2), 16) + parseInt(address.substr(2, 2), 16) + record_type;
                        for (var needle = 0; needle < byte_count; needle += 2) {
                            // if flash_block was increased and wasn't yet defined, we will define him here to avoid undefined errors
                            if (uploader_hex_to_flash_parsed[flash_block] === undefined) {
                                uploader_hex_to_flash_parsed[flash_block] = new Array();
                            }
                            
                            var num = parseInt(data.substr(needle, 2), 16); // get one byte in hex and convert it to decimal
                            uploader_hex_to_flash_parsed[flash_block].push(num); // push to 128 bit array
                            
                            crc += num;
                            
                            bytes_in_block++;
                            if (bytes_in_block == 128) { // 256 hex chars = 128 bytes
                                // new block
                                flash_block++;
                            
                                // reset counter
                                bytes_in_block = 0;
                            }
                        }
                        
                        // change crc to 2's complement (same as checksum)
                        crc = ~crc + 1;
                        crc &= 0xFF;
                        
                        // verify 
                        if (crc != checksum) {
                            hexfile_valid = false;
                        }
                    }
                }
                
                if (hexfile_valid) {
                    if (debug) console.log('HEX file parsed, ready for flashing - ' + bytes_in_sketch + ' bytes');
                    command_log('HEX file parsed, ready for flashing - ' + bytes_in_sketch + ' bytes');
                } else {
                    if (debug) console.log('HEX file CRC check failed, file appears to be corrupted, we recommend to re-install the application');
                    if (debug) console.log('HEX file parsed, CRC check failed - ' + bytes_in_sketch + ' bytes');
                    command_log('HEX file CRC check failed, file appears to be corrupted, we recommend to re-install the application'); 
                }
            });
        });
        
        $('a.flash').click(function() {
            if ($('input[name="selected_firmware"]').is(':checked') && hexfile_valid) { // only allow flashing if firmware was selected and hexfile is valid
                if ($('input[name="selected_firmware"]:checked').val() != 'TX-6') {
                    // STK500 protocol based arduino bootloaders
                    selected_port = String($('div#port-picker .port select').val());
                    
                    if (selected_port != '0') {
                        chrome.serial.open(selected_port, {bitrate: 57600}, function(openInfo) {
                            connectionId = openInfo.connectionId;
                            
                            if (connectionId != -1) {       
                                if (debug) console.log('Connection was opened with ID: ' + connectionId);
                                command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);

                                // we are connected, disabling connect button in the UI
                                GUI.connect_lock = true;
                                
                                // start the upload procedure
                                upload_procedure(0);
                            }
                        });
                    }
                } else {
                    // AVR109 protocol based arduino bootloaders
                    selected_port = String($('div#port-picker .port select').val());
                    
                    // request current port list
                    var old_port_list, new_port_list;
                    chrome.serial.getPorts(function(ports) {
                        if (ports.length > 0) {
                            if (debug) console.log('AVR109 - Grabbing current port list: ' + ports);
                            old_port_list = ports;
                            
                            // connect & disconnect at 1200 baud rate so atmega32u4 jumps into bootloader mode and connect with a new port
                            if (selected_port != '0') {
                                chrome.serial.open(selected_port, {bitrate: 1200}, function(openInfo) {
                                    if (openInfo.connectionId != -1) {
                                        if (debug) console.log('AVR109 - Connection to ' + selected_port + ' opened with ID: ' + openInfo.connectionId + ' at 1200 baud rate');
                                        // we connected succesfully, we will disconnect now
                                        chrome.serial.close(openInfo.connectionId, function(result) {
                                            if (result) {
                                                // disconnected succesfully, now we will wait/watch for new serial port to appear
                                                if (debug) console.log('AVR109 - Connection closed successfully');
                                                if (debug) console.log('AVR109 - Waiting for new port to appear');
                                                
                                                var retry = 0;
                                                
                                                GUI.interval_add('new_port_search', function() {
                                                    chrome.serial.getPorts(function(ports) {
                                                        new_port_list = ports;
                                                        
                                                        new_port_list.forEach(function(new_port) {
                                                            var new_port_found = true;
                                                            
                                                            old_port_list.some(function(old_port) {
                                                                if (old_port == new_port) {
                                                                    new_port_found = false;
                                                                    return false;
                                                                }
                                                            });
                                                            
                                                            if (new_port_found) {
                                                                GUI.interval_remove('new_port_search');
                                                                
                                                                if (debug) console.log('AVR109 - New port found: ' + new_port);
                                                                
                                                                chrome.serial.open(new_port, {bitrate: 57600}, function(openInfo) {
                                                                    connectionId = openInfo.connectionId;
                                                                    
                                                                    if (connectionId != -1) {       
                                                                        if (debug) console.log('Connection was opened with ID: ' + connectionId);
                                                                        command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);

                                                                        // we are connected, disabling connect button in the UI
                                                                        GUI.connect_lock = true;
                                                                        
                                                                        // start the upload procedure
                                                                        avr109_upload_procedure(0);
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    });
                                                    
                                                    if (retry++ > 16) { // more then 8 seconds
                                                        GUI.interval_remove('new_port_search');
                                                        
                                                        if (debug) console.log('AVR109 - Port not found within 8 seconds');
                                                        if (debug) console.log('AVR109 - Upload failed');
                                                    }
                                                }, 500);
                                            } else {
                                                if (debug) console.log('AVR109 - Failed to close connection');
                                            }
                                        });                                        
                                    } else {
                                        if (debug) console.log('AVR109 - Failed to open connection');
                                    }
                                });
                            }
                        }
                    });
                }
            } else {
                command_log('Please select firmware from the menu below');
            }
        });
        
        $('a.go_back').click(function() {
            if (GUI.connect_lock != true) { // back button disabled while the flash process is running
                GUI.operating_mode = 0; // we are leaving firmware flash mode
                
                tab_initialize_default();
            } else {
                command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
            }
        });
    });
}

function verify_chip_signature(high, mid, low) {
    if (high == 0x1E) { // atmega
        if (mid == 0x95) {
            if (low == 0x14) { // 328 batch
                // 328
                command_log('Chip recognized as ATmega328');
                
                return true;
            } else if (low == 0x0F) {
                // 328P
                command_log('Chip recognized as ATmega328P');
                
                return true;
            } else if (low == 0x87) {
                // 32u4
                command_log('Chip recognized as ATmega32U4 (Leonardo)');
                
                return true;
            }
        }
    } 
    
    return false;
}
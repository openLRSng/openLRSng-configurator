function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');
    
    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.operating_mode = 2; // we are in firmware flash mode
        
        $('input[name="selected_firmware"]').change(function() {
            var val = $(this).val();

            $.get("./fw/" + val + ".hex", function(result) {
                uploader_hex_parsed = read_hex_file(result);
            });
        });
        
        $('a.flash').click(function() {
            if ($('input[name="selected_firmware"]').is(':checked') && uploader_hex_parsed) { // only allow flashing if firmware was selected and hexfile is valid
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
                                STK500.initialize(uploader_hex_parsed);
                            }
                        });
                    } else {
                        command_log('Please select valid serial port');
                    }
                } else {
                    // AVR109 protocol based arduino bootloaders
                    selected_port = String($('div#port-picker .port select').val());
                    
                    // request current port list
                    var old_port_list;
                    chrome.serial.getPorts(function(ports) {
                        if (ports.length > 0) {
                            old_port_list = ports;
                            if (debug) console.log('AVR109 - Grabbing current port list: ' + old_port_list);
                            
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
                                                if (debug) console.log('AVR109 - Waiting for programming port to connect');
                                                command_log('AVR109 - Waiting for programming port to connect');
                                                
                                                var retry = 0;
                                                
                                                GUI.interval_add('AVR109_new_port_search', function() {
                                                    chrome.serial.getPorts(function(new_port_list) {   
                                                        if (old_port_list.length > new_port_list.length) {
                                                            // find removed port (for debug purposes only)
                                                            var removed_ports = _.difference(old_port_list, new_port_list);
                                                            if (debug) console.log('AVR109 - Port removed: ' + removed_ports[0]);
                                                            
                                                            // update old_port_list with "just" current ports
                                                            old_port_list = new_port_list;
                                                        } else {
                                                            var new_ports = _.difference(new_port_list, old_port_list);
                                                            
                                                            if (new_ports.length > 0) {
                                                                GUI.interval_remove('AVR109_new_port_search');
                                                                
                                                                if (debug) console.log('AVR109 - New port found: ' + new_ports[0]);
                                                                command_log('AVR109 - New port found: <strong>' + new_ports[0] + '</strong>');
                                                                
                                                                chrome.serial.open(new_ports[0], {bitrate: 57600}, function(openInfo) {
                                                                    connectionId = openInfo.connectionId;
                                                                    
                                                                    if (connectionId != -1) {       
                                                                        if (debug) console.log('Connection was opened with ID: ' + connectionId);
                                                                        command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);

                                                                        // we are connected, disabling connect button in the UI
                                                                        GUI.connect_lock = true;
                                                                        
                                                                        // start the upload procedure
                                                                        AVR109.initialize(uploader_hex_parsed);
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                    
                                                    if (retry++ > 80) { // more then 8 seconds
                                                        GUI.interval_remove('AVR109_new_port_search');
                                                        
                                                        if (debug) console.log('AVR109 - Port not found within 8 seconds');
                                                        if (debug) console.log('AVR109 - Upload failed');
                                                        command_log('AVR109 - Port not found within 8 seconds');
                                                        command_log('AVR109 - Upload <span style="color: red">failed</span>');
                                                    }
                                                }, 100, true);
                                            } else {
                                                if (debug) console.log('AVR109 - Failed to close connection');
                                            }
                                        });                                        
                                    } else {
                                        if (debug) console.log('AVR109 - Failed to open connection');
                                    }
                                });
                            } else {
                                command_log('Please select valid serial port');
                            }
                        }
                    });
                }
            } else {
                command_log('Please first select firmware from the menu below');
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
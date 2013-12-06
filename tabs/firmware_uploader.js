function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');
    
    var uploader_hex_parsed = undefined;
    
    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.active_tab = 'firmware_uploader';
        GUI.operating_mode = 2; // we are in firmware flash mode
        
        $('input[name="selected_firmware"]').change(function() {
            var val = $(this).val();

            $.get("./fw/" + val + ".hex", function(result) {
                // parsing hex in different thread
                var worker = new Worker('./workers/hex_parser.js');
                
                // "callback"
                worker.onmessage = function (event) {
                    uploader_hex_parsed = event.data;
                    
                    $('div.firmware_info .type').html('Embedded Firmware');
                    $('div.firmware_info .version').html(firmware_version_accepted[0] + '.' + firmware_version_accepted[1] + '.' + firmware_version_accepted[2]);
                    $('div.firmware_info .size').html(uploader_hex_parsed.bytes + ' bytes');
                };
                
                // send data/string over for processing
                worker.postMessage(result);
            });
        });
        
        $('a.load_custom_firmware').click(function() {
            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['hex']}]}, function(fileEntry) {
                if (!fileEntry) {
                    // no "valid" file selected/created, aborting
                    console.log('No valid file selected, aborting');
                    return;
                }
                
                chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                    console.log('Loading file from: ' + path);
                    
                    fileEntry.file(function(file) {
                        var reader = new FileReader();

                        reader.onerror = function (e) {
                            console.error(e);
                        };
                        
                        reader.onloadend = function(e) {
                            console.log('File loaded');
                            
                            // parsing hex in different thread
                            var worker = new Worker('./workers/hex_parser.js');
                            
                            // "callback"
                            worker.onmessage = function (event) {
                                uploader_hex_parsed = event.data;
                                
                                if (uploader_hex_parsed) {
                                    $('div.firmware_info .type').html('Custom Firmware');
                                    $('div.firmware_info .version').html('Unknown');
                                    $('div.firmware_info .size').html(uploader_hex_parsed.bytes + ' bytes');
                                } else {
                                    $('div.firmware_info .type').html('Firmware Corrupted');
                                    $('div.firmware_info .version').html('Unknown');
                                    $('div.firmware_info .size').html('Firmware Corrupted');
                                
                                    command_log('HEX file appears to be <span style="color: red">corrupted</span>');
                                }
                            };
                            
                            // send data/string over for processing
                            worker.postMessage(e.target.result);
                        };

                        reader.readAsText(file);
                    });
                });
            });
        });
        
        $('a.flash').click(function() {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                // only allow flashing if firmware was selected and hexfile is valid
                if (uploader_hex_parsed) {
                    if ($('input[name="selected_firmware"]').is(':checked')) {
                        if ($('input[name="selected_firmware"]:checked').val() == 'TX-6') {
                            // AVR109 protocol based arduino bootloaders
                            if (uploader_hex_parsed.bytes <= 28672) { // don't allow to go over-allowed flash (might be better to implement this inside flash protocol)
                                AVR109.hex = uploader_hex_parsed;
                                AVR109.connect();
                            } else {
                                command_log('Firmware size is <span style="color: red">too big</span>, did you loaded the correct firmware for selected board?');
                            }
                        } else if ($('input[name="selected_firmware"]:checked').val() == 'RX-32') {
                            // STM32 protocol based bootloaders
                            if (uploader_hex_parsed.bytes <= 131072) { // don't allow to go over-allowed flash (might be better to implement this inside flash protocol)
                                STM32.hex = uploader_hex_parsed;
                                STM32.connect();
                            } else {
                                command_log('Firmware size is <span style="color: red">too big</span>, did you loaded the correct firmware for selected board?');
                            }
                        } else {
                            // STK500 protocol based arduino bootloaders
                            if (uploader_hex_parsed.bytes <= 30720) { // don't allow to go over-allowed flash (might be better to implement this inside flash protocol)
                                STK500.hex = uploader_hex_parsed;
                                STK500.connect();
                            } else {
                                command_log('Firmware size is <span style="color: red">too big</span>, did you loaded the correct firmware for selected board?');
                            }
                        }
                    } else {
                        command_log('Please first <strong>Select Board</strong> from the menu below');
                    }
                } else {
                    command_log('Can not flash <span style="color: red">corrupted</span> firmware, please select different HEX file or re-select board to load embedded firmware');
                }
            }
        });
        
        $('a.go_back').click(function() {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
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
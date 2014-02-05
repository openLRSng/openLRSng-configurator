function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');
    
    var uploader_hex_parsed = undefined;
    
    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.active_tab = 'firmware_uploader';
        GUI.operating_mode = 2; // we are in firmware flash mode
        
        $('input[name="module"]').change(function() {
            switch($(this).prop('value')) {
                case 'TX':
                    $('select.boards_TX').prop('disabled', false).change();
                    $('select.boards_RX').prop('disabled', true);
                    break;
                case 'RX':
                    $('select.boards_RX').prop('disabled', false).change();
                    $('select.boards_TX').prop('disabled', true);
                    break;
                case 'auto_update':
                    $('select.boards_TX, select.boards_RX').prop('disabled', true);

                    $('div.firmware_info .type').html('Embedded Firmware');
                    $('div.firmware_info .version').html(firmware_version_accepted[0] + '.' + firmware_version_accepted[1] + '.' + firmware_version_accepted[2]);
                    $('div.firmware_info .size').html('Depends on the module');
                    break;
            }
        });
        
        $('select.boards_TX, select.boards_RX').change(function() {
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
        
        $('div.module_select input.auto_update').click(); // select auto update on initial load
        
        $('a.load_custom_firmware').click(function() {
            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['hex']}]}, function(fileEntry) {
                if (!fileEntry) {
                    // no "valid" file selected/created, aborting
                    console.log('No valid file selected, aborting');
                    return;
                }
                
                chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                    if (debug) console.log('Loading file from: ' + path);
                    
                    fileEntry.file(function(file) {
                        var reader = new FileReader();
                        
                        reader.onprogress = function(e) {
                            if (e.total > 1048576) { // 1 MB
                                // dont allow reading files bigger then 1 MB
                                if (debug) console.log('File limit (1 MB) exceeded, aborting');
                                GUI.log('File limit (1 MB) <span style="color: red">exceeded</span>, aborting');
                                reader.abort();
                            }
                        };
                        
                        reader.onloadend = function(e) {
                            if (e.total != 0 && e.total == e.loaded) {
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
                                    
                                        GUI.log('HEX file appears to be <span style="color: red">corrupted</span>');
                                    }
                                };
                                
                                // send data/string over for processing
                                worker.postMessage(e.target.result);
                            }
                        };

                        reader.readAsText(file);
                    });
                });
            });
        });
        
        $('a.flash').click(function() {
            // button is disabled while flashing is in progress
            if (!GUI.connect_lock) {
                if ($('div.module_select input:checked').val() == 'auto_update') {
                    console.log('auto update executed');
                } else {
                    // only allow flashing if firmware was selected and hexfile is valid
                    if (uploader_hex_parsed) {
                        switch($('select.boards_TX:enabled, select.boards_RX:enabled').prop('value')) {
                            case 'TX-6': // AVR109 protocol based arduino bootloaders
                                AVR109.connect(uploader_hex_parsed);
                                break;
                            case 'RX-32': // STM32 protocol based bootloaders
                                STM32.connect(uploader_hex_parsed);
                                break;
                            
                            default: // STK500 protocol based arduino bootloaders
                                STK500.connect(uploader_hex_parsed);
                        }
                    } else {
                        GUI.log('Can not flash <span style="color: red">corrupted</span> firmware, please select different HEX file or re-select board to load embedded firmware');
                    }
                }
            }
        });
        
        $('a.go_back').click(function() {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                GUI.operating_mode = 0; // we are leaving firmware flash mode
                
                tab_initialize_default();
            } else {
                GUI.log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
            }
        });
    });
}
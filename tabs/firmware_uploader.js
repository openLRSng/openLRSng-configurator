function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');

    var uploader_hex_parsed = undefined;

    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.active_tab = 'firmware_uploader';

        // translate to user-selected language
        localize();

        // we are in firmware flash mode
        GUI.operating_mode = 2;

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
                    $('div.firmware_info .version').html(firmware_version_embedded[0] + '.' + firmware_version_embedded[1] + '.' + firmware_version_embedded[2]);
                    $('div.firmware_info .size').html('Depends on the module');
                    break;
            }
        });

        $('select.boards_TX, select.boards_RX').change(function() {
            var val = $(this).val();

            $.get("./firmware/" + val + ".hex", function(result) {
                // parsing hex in different thread
                var worker = new Worker('./js/workers/hex_parser.js');

                // "callback"
                worker.onmessage = function (event) {
                    uploader_hex_parsed = event.data;

                    $('div.firmware_info .type').html('Embedded Firmware');
                    $('div.firmware_info .version').html(firmware_version_embedded[0] + '.' + firmware_version_embedded[1] + '.' + firmware_version_embedded[2]);
                    $('div.firmware_info .size').html(uploader_hex_parsed.bytes_total + ' bytes');
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
                    console.log('Loading file from: ' + path);

                    fileEntry.file(function(file) {
                        var reader = new FileReader();

                        reader.onprogress = function(e) {
                            if (e.total > 1048576) { // 1 MB
                                // dont allow reading files bigger then 1 MB
                                console.log('File limit (1 MB) exceeded, aborting');
                                GUI.log('File limit (1 MB) <span style="color: red">exceeded</span>, aborting');
                                reader.abort();
                            }
                        };

                        reader.onloadend = function(e) {
                            if (e.total != 0 && e.total == e.loaded) {
                                console.log('File loaded');

                                // parsing hex in different thread
                                var worker = new Worker('./js/workers/hex_parser.js');

                                // "callback"
                                worker.onmessage = function (event) {
                                    uploader_hex_parsed = event.data;

                                    if (uploader_hex_parsed) {
                                        $('div.firmware_info .type').html('Custom Firmware');
                                        $('div.firmware_info .version').html('Unknown');
                                        $('div.firmware_info .size').html(uploader_hex_parsed.bytes_total + ' bytes');
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
                    var selected_port = String($('div#port-picker .port select').val());

                    if (selected_port != '0') {
                        if (GUI.optional_usb_permissions) {
                            chrome.usb.getDevices(usbDevices.atmega32u4, function(result) {
                                if (result.length > 0) {
                                    // opening port at 1200 baud rate, sending nothing, closing == mcu in programmer mode
                                    serial.connect(selected_port, {bitrate: 1200}, function(result) {
                                        if (result) {
                                            // we are connected, disabling connect button in the UI
                                            GUI.connect_lock = true;

                                            serial.disconnect(function(result) {
                                                if (result) {
                                                    // disconnected succesfully, now we will wait/watch for new serial port to appear
                                                    console.log('atmega32u4 was switched to programming mode via 1200 baud trick');
                                                    PortHandler.port_detected('port_handler_search_atmega32u4_prog_port', function(new_ports) {
                                                        if (new_ports) {
                                                            console.log('atmega32u4 programming port found, sending exit bootloader command');

                                                            serial.connect(new_ports[0], {bitrate: 57600}, function(openInfo) {
                                                                if (openInfo) {
                                                                    connectionId = openInfo.connectionId;

                                                                    // connected to programming port, send programming mode exit
                                                                    var bufferOut = new ArrayBuffer(1);
                                                                    var bufferView = new Uint8Array(bufferOut);

                                                                    bufferView[0] = 0x45; // exit bootloader

                                                                    // send over the actual data
                                                                    serial.send(bufferOut, function(result) {
                                                                        serial.disconnect(function(result) {
                                                                            if (result) {
                                                                                PortHandler.port_detected('port_handler_search_atmega32u4_regular_port', function(new_ports) {
                                                                                    for (var i = 0; i < new_ports.length; i++) {
                                                                                        if (new_ports[i] == selected_port) {
                                                                                            // open the port while mcu is starting
                                                                                            auto_update(selected_port);
                                                                                        }
                                                                                    }
                                                                                }, false);
                                                                            } else {
                                                                                GUI.log('<span style="color: red">Failed</span> to close serial port');
                                                                                GUI.connect_lock = false;
                                                                            }
                                                                        });
                                                                    });
                                                                }
                                                            });
                                                        } else {
                                                            GUI.log('Regular atmega32u4 port <span style="color: red">not</span> found, connecting <span style="color: red">failed</span>');
                                                            GUI.connect_lock = false;
                                                        }
                                                    }, 8000);
                                                } else {
                                                    GUI.log('<span style="color: red">Failed</span> to close serial port');
                                                    GUI.connect_lock = false;
                                                }
                                            });
                                        } else {
                                            GUI.log('<span style="color: red">Failed</span> to open serial port');
                                        }
                                    });
                                } else {
                                    auto_update(selected_port);
                                }
                            });
                        } else {
                            auto_update(selected_port);
                        }
                    } else {
                        GUI.log(chrome.i18n.getMessage('error_no_valid_port'));
                    }
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
            } else {
                GUI.log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
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

        var auto_update = function(port) {
            serial.connect(port, {bitrate: 115200}, function(openInfo) {
                if (openInfo) {
                    GUI.log('Connection <span style="color: green">successfully</span> opened with ID: ' + openInfo.connectionId);

                    // we are connected, disabling connect button in the UI
                    GUI.connect_lock = true;

                    GUI.timeout_add('wait_for_startup_message', function() {
                        GUI.log('Startup message not received withing 10 seconds, Auto Update <span style="color: red">failed</span>');
                        GUI.connect_lock = false;

                        serial.disconnect(function(result) {
                            if (result) { // All went as expected
                                GUI.log('Serial port <span style="color: green">successfully</span> closed');
                            } else { // Something went wrong
                                GUI.log('<span style="color: red">Failed</span> to close serial port');
                            }
                        });
                    }, 10000);

                    var options = {};
                    if (GUI.use_rts) options.rts = true;
                    else options.dtr = true;

                    serial.setControlSignals(options, function(result) {
                        var message_buffer = "";

                        serial.onReceive.addListener(function startup_message_listener(info) {
                            var data = new Uint8Array(info.data);

                            // run through the data/chars received
                            for (var i = 0; i < data.length; i++) {
                                if (data[i] != 13) { // CR
                                    if (data[i] != 10) { // LF
                                        message_buffer += String.fromCharCode(data[i]);
                                    } else {
                                        if (message_buffer.indexOf('OpenLRSng') != -1) {
                                            var message_array = message_buffer.split(' ');

                                            var data = {};

                                            // get module type
                                            if (message_buffer.indexOf('TX') != -1) data.type = 'TX';
                                            else data.type = 'RX';

                                            // get board number
                                            data.board_number = message_array[message_array.length - 1];

                                            // get firmware version
                                            data.firmware_version = message_array[message_array.indexOf('starting') + 1];

                                            var version_array = data.firmware_version.split('.');
                                            data.firmware_version_array = [];
                                            for (var b = 0; b < version_array.length; b++) {
                                                data.firmware_version_array.push(parseInt(version_array[b]));
                                            }

                                            data.firmware_version_hex = parseInt(version_array[0] + version_array[1] + version_array[2], 16);

                                            GUI.log('Detected - Type: ' + data.type + ', HW: ' + data.board_number + ', FW: ' + data.firmware_version);


                                            serial.disconnect(function(result) {
                                                GUI.timeout_remove('wait_for_startup_message'); // since above code could fail (due to too-old firmware), we will kill the timeout in here

                                                if (result) { // All went as expected
                                                    var current_version = parseInt(String(firmware_version_embedded[0]) + String(firmware_version_embedded[1]) + String(firmware_version_embedded[2]), 16);

                                                    if (data.firmware_version_hex < current_version) {
                                                        GUI.log('Updating');

                                                        var type = data.type + '-' + data.board_number;

                                                        $.get("./firmware/" + type + ".hex", function(result) {
                                                            // parsing hex in different thread
                                                            var worker = new Worker('./js/workers/hex_parser.js');

                                                            // "callback"
                                                            worker.onmessage = function (event) {
                                                                uploader_hex_parsed = event.data;

                                                                $('div.firmware_info .type').html('Embedded Firmware');
                                                                $('div.firmware_info .version').html(firmware_version_embedded[0] + '.' + firmware_version_embedded[1] + '.' + firmware_version_embedded[2]);
                                                                $('div.firmware_info .size').html(uploader_hex_parsed.bytes_total + ' bytes');

                                                                // flash
                                                                switch(type) {
                                                                    case 'TX-6': // AVR109 protocol based arduino bootloaders
                                                                        AVR109.connect(uploader_hex_parsed);
                                                                        break;
                                                                    case 'RX-32': // STM32 protocol based bootloaders
                                                                        STM32.connect(uploader_hex_parsed);
                                                                        break;

                                                                    default: // STK500 protocol based arduino bootloaders
                                                                        STK500.connect(uploader_hex_parsed);
                                                                }
                                                            };

                                                            // send data/string over for processing
                                                            worker.postMessage(result);
                                                        });
                                                    } else {
                                                        GUI.log('You are already running the <strong>latest</strong> firmware');

                                                        GUI.connect_lock = false;
                                                    }

                                                    GUI.log('Serial port <span style="color: green">successfully</span> closed');
                                                } else { // Something went wrong
                                                    GUI.log('<span style="color: red">Failed</span> to close serial port');
                                                    GUI.connect_lock = false;
                                                }
                                            });
                                        } else {
                                            // reset buffer
                                            message_buffer = "";
                                        }
                                    }
                                }
                            }
                        });
                    });
                } else {
                    GUI.log('<span style="color: red">Failed</span> to open serial port');
                }
            });
        };
    });
}
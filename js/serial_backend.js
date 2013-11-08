var connectionId = -1;

$(document).ready(function() {    
    $('div#port-picker a.connect').click(function() {
        if (GUI.connect_lock != true) { // GUI control overrides the user control
            var clicks = $('div#port-picker a.connect').data('clicks');
            
            if (!clicks) {
                var selected_port = String($('div#port-picker .port select').val());
                var selected_baud = parseInt($('div#port-picker #baud').val());
                
                if (selected_port != '0' && selected_port != 'null') {
                    if (debug) console.log('Connecting to: ' + selected_port);
                    // connecting_to is used in auto-connect to prevent auto-connecting while we are in the middle of connect procedure
                    GUI.connecting_to = selected_port;
                    
                    $('div#port-picker a.connect').text('Connecting'); 
                    
                    // We need to check if we are dealing with standard usb to serial adapter or virtual serial
                    // before we open the port, as standard serial adapters support DTR, where virtual serial usually does not.
                    if (GUI.optional_usb_permissions) {
                        chrome.usb.getDevices(usbDevices.atmega32u4, function(result) {
                            if (result.length > 0) {
                                // Grab current ports for comparison
                                var old_port_list;
                                chrome.serial.getPorts(function(ports) {
                                    if (ports.length > 0) {
                                        old_port_list = ports;
                                        
                                        // opening port at 1200 baud rate, sending nothing, closing == mcu in programmer mode
                                        chrome.serial.open(selected_port, {bitrate: 1200}, function(result) {
                                            if (result.connectionId != -1) {
                                                chrome.serial.close(result.connectionId, function(result) {
                                                    if (result) {
                                                        // disconnected succesfully, now we will wait/watch for new serial port to appear
                                                        
                                                        if (debug) console.log('atmega32u4 was switched to programming mode via 1200 baud trick');
                                                        
                                                        GUI.interval_add('atmega32u4_new_port_search', function() {
                                                            chrome.serial.getPorts(function(new_port_list) {   
                                                                if (old_port_list.length > new_port_list.length) {
                                                                    // find removed port (for debug purposes only)
                                                                    var removed_ports = array_difference(old_port_list, new_port_list);
                                                                    
                                                                    // update old_port_list with "just" current ports
                                                                    old_port_list = new_port_list;
                                                                } else {
                                                                    var new_ports = array_difference(new_port_list, old_port_list);
                                                                    
                                                                    if (new_ports.length > 0) {
                                                                        GUI.interval_remove('atmega32u4_new_port_search');
                                                                        if (debug) console.log('atmega32u4 programming port found, sending exit bootloader command');
                                                                        
                                                                        chrome.serial.open(new_ports[0], {bitrate: 57600}, function(openInfo) {
                                                                            connectionId = openInfo.connectionId;
                                                                            
                                                                            if (connectionId != -1) {       
                                                                                // connected to programming port, send programming mode exit
                                                                                var bufferOut = new ArrayBuffer(1);
                                                                                var bufferView = new Uint8Array(bufferOut);
                                                                                
                                                                                bufferView[0] = 0x45; // exit bootloader
                                                                                
                                                                                // send over the actual data
                                                                                chrome.serial.write(connectionId, bufferOut, function(result) {
                                                                                    chrome.serial.close(connectionId, function(result) {
                                                                                        connectionId = -1; // reset connection id
                                                                                        
                                                                                        GUI.interval_add('atmega32u4_connect_to_previous_port', function() {
                                                                                            chrome.serial.getPorts(function(ports) {
                                                                                                for (var i = 0; i < ports.length; i++) {
                                                                                                    if (ports[i] == selected_port) {
                                                                                                        // port matches previously selected port, continue connection procedure
                                                                                                        GUI.interval_remove('atmega32u4_connect_to_previous_port');
                                                                                                        
                                                                                                        if (debug) console.log('atmega32u4 regular port detected after restart, connecting to it');
                                                                                                        
                                                                                                        // open the port while mcu is starting
                                                                                                        chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                                                                                                    }
                                                                                                }
                                                                                            });
                                                                                        }, 50, true);
                                                                                    });
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                }
                                                            });
                                                        }, 50, true);
                                                    }
                                                });
                                            } else {
                                                $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                                                if (debug) console.log('There was a problem while opening the connection');
                                                command_log('<span style="color: red">Failed</span> to open serial port');
                                            }
                                        });
                                    }
                                });
                            } else {
                                chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                            }
                        });
                    } else {
                        // We don't have optional usb permissions, we will connect directly, regardless of serial port nature
                        chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                    }
                    
                    // saving last used port in local storage
                    chrome.storage.local.set({'last_used_port': selected_port}, function() {
                        if (debug) console.log('Saving last used port: ' + selected_port);
                    });
                    
                    $('div#port-picker a.connect').data("clicks", !clicks);
                } else {
                    command_log('Please select valid serial port');
                }
            } else {
                // Run cleanup routine for a selected tab (not using callback because hot-unplug wouldn't fire)
                GUI.tab_switch_cleanup();

                // Send PSP_SET_EXIT after 50 ms (works with hot-unplug and normal disconnect)
                GUI.timeout_add('psp_exit', function() {
                    send_message(PSP.PSP_SET_EXIT);
                    
                    // after 50ms (should be enough for PSP_SET_EXIT to trigger in normal disconnect), kill all timers, clean callbacks
                    // and disconnect from the port (works in hot-unplug and normal disconnect)
                    GUI.timeout_add('exit', function() {
                        GUI.interval_kill_all(['auto-connect']); // auto-connect is kept alive
                        PSP.callbacks = []; // empty PSP callbacks array (this is only required if user hot-disconnect)
                        
                        chrome.serial.close(connectionId, onClosed);
                    }, 50);
                }, 50);

                GUI.lock_default();
                GUI.operating_mode = 0; // we are disconnected
                GUI.connected_to = false;
                
                $('div#port-picker a.connect').text('Connect').removeClass('active');
                
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                
                // load default html
                tab_initialize_default();            
                
                $('div#port-picker a.connect').data("clicks", !clicks);
            }
        } else {
            command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
        }
    }); 
    
    // auto-connect
    chrome.storage.local.get('auto_connect', function(result) {
        if (typeof result.auto_connect === 'undefined') {
            // auto_connect wasn't saved yet, save and push true to the GUI
            chrome.storage.local.set({'auto_connect': true});
            
            GUI.auto_connect = true;
        } else {
            if (result.auto_connect) { 
                // enabled by user
                GUI.auto_connect = true;
                
                $('input.auto_connect').prop('checked', true);
                $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new serial port is detected');
            } else { 
                // disabled by user
                GUI.auto_connect = false;
                
                $('input.auto_connect').prop('checked', false);
                $('input.auto_connect').prop('title', 'Auto-Connect: Disabled - User needs to select the correct serial port and click "Connect" button on its own');
            }
        }

        if (debug) console.log('Scanning for new ports...');
        serial_auto_connect();
        
        // bind UI hook to auto-connect checkbos
        $('input.auto_connect').change(function() {
            GUI.auto_connect = $(this).is(':checked');
            
            // update title/tooltip
            if (GUI.auto_connect) {
                $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new port is detected');
            } else {
                $('input.auto_connect').prop('title', 'Auto-Connect: Disabled - User needs to select the correct serial port and click "Connect" button on its own');
            }
            
            chrome.storage.local.set({'auto_connect': GUI.auto_connect}, function() {});
        });
    });
});

function serial_auto_connect() {
    var initial_ports = false;
    
    GUI.interval_add('auto-connect', function() {
        chrome.serial.getPorts(function(current_ports) {
            if (initial_ports.length > current_ports.length || !initial_ports) {
                // port got removed or initial_ports wasn't initialized yet
                var removed_ports = array_difference(initial_ports, current_ports);
                
                if (debug & initial_ports != false) console.log('Port removed: ' + removed_ports);
                
                // disconnect "UI" if necessary
                if (GUI.connected_to != false && removed_ports[0] == GUI.connected_to) {
                    $('div#port-picker a.connect').click();
                }
                
                // refresh COM port list
                update_port_select_menu(current_ports);
                
                // auto-select last used port (only during initialization)
                if (!initial_ports) {
                    chrome.storage.local.get('last_used_port', function(result) {
                        // if last_used_port was set, we try to select it
                        if (result.last_used_port) {                            
                            current_ports.forEach(function(port) {
                                if (port == result.last_used_port) {
                                    if (debug) console.log('Selecting last used port: ' + result.last_used_port);
                                    
                                    $('div#port-picker .port select').val(result.last_used_port);
                                }
                            });
                        } else {
                            if (debug) console.log('Last used port wasn\'t saved "yet", auto-select disabled.');
                        }
                    });
                }
                
                // reset initial_ports
                initial_ports = current_ports;
            }
            
            var new_ports = array_difference(current_ports, initial_ports);
            
            if (new_ports.length > 0) {
                if (debug) console.log('New port found: ' + new_ports[0]);
                
                // generate new COM port list
                update_port_select_menu(current_ports);
                
                if (!GUI.connected_to) {
                    $('div#port-picker .port select').val(new_ports[0]);
                } else {   
                    $('div#port-picker .port select').val(GUI.connected_to);
                }
                
                // start connect procedure
                if (GUI.auto_connect && !GUI.connecting_to && !GUI.connected_to) {
                    if (GUI.operating_mode != 2) { // if we are inside firmware flasher, we won't auto-connect
                        GUI.timeout_add('auto-connect_timeout', function() {
                            $('div#port-picker a.connect').click();
                        }, 50); // small timeout so we won't get any nasty connect errors due to system initializing the bus
                    }
                }
                
                // reset initial_ports
                initial_ports = current_ports;
            }
        });
    }, 100, true);
}

function update_port_select_menu(ports) {
    $('div#port-picker .port select').html(''); // drop previous one
    
    if (ports.length > 0) {
        for (var i = 0; i < ports.length; i++) {
            $('div#port-picker .port select').append($("<option/>", {value: ports[i], text: ports[i]}));
        }
    } else {
        $('div#port-picker .port select').append($("<option/>", {value: 0, text: 'NOT FOUND'}));
    }    
}

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        // update connected_to
        GUI.connected_to = GUI.connecting_to;
        
        // reset connecting_to
        GUI.connecting_to = false;
        
        if (debug) console.log('Connection was opened with ID: ' + connectionId);
        command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);
        
        // send DTR (this should reret any standard AVR mcu)
        chrome.serial.setControlSignals(connectionId, {dtr: true}, function(result) {
            var now = microtime();
            
            // this message is ignored by units with DTR, units without DTR use it to return into binary mode (re-connecting)
            send("B");
            
            // reset PSP state to default (this is required if we are reconnecting)
            packet_state = 0;
            
            var startup_message_buffer = "";
            var startup_read_time = 0;
            
            GUI.interval_add('startup', function() {
                chrome.serial.read(connectionId, 64, function(readInfo) {   
                    // inner callback
                    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
                        var data = new Uint8Array(readInfo.data);
                        
                        // run through the data/chars received
                        for (var i = 0; i < data.length; i++) {
                            if (data[i] != 13) { // CR
                                if (data[i] != 10) { // LF
                                    startup_message_buffer += String.fromCharCode(data[i]);
                                } else {           
                                    if (startup_message_buffer != "" && startup_message_buffer.length > 2) { // empty lines and messages shorter then 2 chars get ignored here
                                        command_log('Module - ' + startup_message_buffer);
                                    }
                                
                                    // reset buffer
                                    startup_message_buffer = "";
                                }
                                
                                // compare buffer content "on the fly", this check is ran after each byte
                                if (startup_message_buffer == "OpenLRSng starting") {
                                    // module is up, we have ~200 ms to join bindMode
                                    if (debug) console.log('OpenLRSng starting message received');
                                    if (debug) console.log('Module Started in: ' + (microtime() - now).toFixed(4) + ' seconds');
                                    command_log('Module - ' + startup_message_buffer);
                                    command_log("Requesting to enter bind mode");
                                    
                                    GUI.interval_remove('startup');
                                    
                                    // start standard (PSP) read timer
                                    GUI.interval_add('serial_read', read_serial, 10, true); // 10ms interval
                                    
                                    send("BND!", function() {
                                        GUI.timeout_add('binary_mode', function() {
                                            send("B", function() { // B char (to join the binary mode on the mcu)
                                                send_message(PSP.PSP_REQ_FW_VERSION);
                                            });
                                        }, 250); // 250 ms delay (after "OpenLRSng starting" message, mcu waits for 200ms and then reads serial buffer, afterwards buffer gets flushed)
                                    });
                                    
                                    return; // since we "got what we needed" we won't continue with the for loop, just return
                                } else if (startup_message_buffer == "Entering binary mode") {
                                    GUI.interval_remove('startup');
                                    
                                    // start standard (PSP) read timer
                                    GUI.interval_add('serial_read', read_serial, 10, true); // 10ms interval
                                    
                                    send_message(PSP.PSP_REQ_FW_VERSION);
                                } else if (startup_message_buffer == "Entering normal mode") {
                                    // someone is trying to connect RX with configurator, set him on the correct path and disconnect                                    
                                    $('div#port-picker a.connect').click();
                                    
                                    // tiny delay so all the serial messages are parsed to command_log and bus is disconnected
                                    GUI.timeout_add('wrong_module', function() {
                                        command_log('Are you trying to connect directly to the RX to configure? <span style="color: red">Don\'t</span> do that.\
                                        Please re-read the manual, RX configuration is done <strong>wirelessly</strong> through the TX.');
                                    }, 100);
                                }
                            }
                        }
                    }
                });
                
                if (startup_read_time++ >= 2000) { // 10 seconds, variable is increased every 5 ms
                    GUI.interval_remove('startup');
                    
                    $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                    
                    command_log('Start message <span style="color: red;">not</span> received within 10 seconds, disconnecting.');
                }
            }, 5); // 5 ms
        });
        
    } else {
        $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
        if (debug) console.log('There was a problem while opening the connection');
        command_log('<span style="color: red">Failed</span> to open serial port');
    } 
}

function onClosed(result) {
    connectionId = -1; // reset connection id
    
    if (result) { // All went as expected
        if (debug) console.log('Connection closed successfully.');
        command_log('<span style="color: green">Successfully</span> closed serial connection');
    } else { // Something went wrong
        if (debug) console.log('There was an error that happened during "connection-close" procedure');
        command_log('<span style="color: red">Failed</span> to close serial port');
    }    
}

function read_serial() {
    if (GUI.operating_mode >= 0 && GUI.operating_mode < 3) { // configurator
        chrome.serial.read(connectionId, 256, PSP_char_read);
    } else if (GUI.operating_mode == 3) { // spectrum analyzer
        chrome.serial.read(connectionId, 256, SA_char_read);
    }
}

// send is accepting both array and string inputs
function send(data, callback) {
    var bufferOut = new ArrayBuffer(data.length);
    var bufferView = new Uint8Array(bufferOut);
    
    if (typeof data == 'object') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i];
        }
    } else if (typeof data == 'string') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i].charCodeAt(0);
        }
    }
    
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
        if (writeInfo.bytesWritten > 0) {
            if (callback) {
                callback();
            }
        }
    }); 
}
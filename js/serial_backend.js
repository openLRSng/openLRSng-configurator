$(document).ready(function() {    
    $('div#port-picker a.connect').click(function() {
        if (!GUI.connect_lock && GUI.operating_mode != 2) { // GUI control overrides the user control
            var clicks = $('div#port-picker a.connect').data('clicks');
            
            if (!clicks) {
                var selected_port = String($('div#port-picker .port select').val());
                var selected_baud = parseInt($('div#port-picker #baud').val());
                
                if (selected_port != '0' && selected_port != 'null') {
                    if (debug) console.log('Connecting to: ' + selected_port);
                    // connecting_to is used in auto-connect to prevent auto-connecting while we are in the middle of connect procedure
                    GUI.connecting_to = selected_port;
                    GUI.bitrate = selected_baud;
                    
                    // lock port select & baud while we are connecting / connected
                    $('div#port-picker #port, div#port-picker #baud').prop('disabled', true);
                    $('div#port-picker a.connect').text('Connecting'); 
                    
                    serial.connect(selected_port, {bitrate: selected_baud}, onOpen);
                    
                    $('div#port-picker a.connect').data("clicks", !clicks);
                } else {
                    GUI.log('Please select valid serial port');
                }
            } else {
                PSP.disconnect_cleanup();
                PortHandler.flush_callbacks();
                GUI.timeout_kill_all();
                GUI.interval_kill_all();
                GUI.tab_switch_cleanup(); // Run cleanup routine for a selected tab (not using callback because hot-unplug wouldn't fire)

                // Send PSP_SET_EXIT after 50 ms (works with hot-unplug and normal disconnect)
                GUI.timeout_add('psp_exit', function() {
                    PSP.send_message(PSP.PSP_SET_EXIT);
                    
                    // after 50ms (should be enough for PSP_SET_EXIT to trigger in normal disconnect), kill all timers, clean callbacks
                    // and disconnect from the port (works in hot-unplug and normal disconnect)
                    GUI.timeout_add('exit', function() {
                        GUI.lock_default();
                        GUI.operating_mode = 0; // we are disconnected
                        GUI.module = false;
                        GUI.connecting_to = false;
                        GUI.connected_to = false;
                        GUI.bitrate = false;
                        
                        activeProfile = 0; // reset to default
                        
                        serial.disconnect(onClosed);
                    }, 50);
                }, 50);

                
                $('div#port-picker a.connect').text('Connect').removeClass('active');
                
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                
                // unlock port select & baud (if condition allows it)
                $('div#port-picker #port').prop('disabled', false);
                if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);
                
                // load default html
                tab_initialize_default();            
                
                $('div#port-picker a.connect').data("clicks", !clicks);
            }
        } else {
            if (GUI.operating_mode != 2) GUI.log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
            else GUI.log("You <span style=\"color: red\">can't</span> connect to a module while you are in Firmware Flasher, please leave firmware flasher before connecting.");
        }
    }); 
    
    // auto-connect
    chrome.storage.local.get('auto_connect', function(result) {
        if (typeof result.auto_connect === 'undefined') {
            // wasn't saved yet
            GUI.auto_connect = true;
            
            $('input.auto_connect').prop('checked', true);
            $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new serial port is detected');
            $('select#baud').val(115200).prop('disabled', true);
        } else {
            GUI.auto_connect = result.auto_connect;
            
            if (GUI.auto_connect) { 
                $('input.auto_connect').prop('checked', true);
                $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new serial port is detected');
                
                $('select#baud').val(115200).prop('disabled', true);
            } else { 
                $('input.auto_connect').prop('checked', false);
                $('input.auto_connect').prop('title', 'Auto-Connect: Disabled - User needs to select the correct serial port and click "Connect" button on its own');
                
                $('select#baud').val(115200).prop('disabled', false);
            }
        }
        
        // bind UI hook to auto-connect checkbos
        $('input.auto_connect').change(function() {
            GUI.auto_connect = $(this).is(':checked');
            
            // update title/tooltip
            if (GUI.auto_connect) {
                $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new port is detected');
                
                $('select#baud').val(115200).prop('disabled', true);
            } else {
                $('input.auto_connect').prop('title', 'Auto-Connect: Disabled - User needs to select the correct serial port and click "Connect" button on its own');
                
                if (!GUI.connected_to && !GUI.connecting_to) $('select#baud').prop('disabled', false);
            }
            
            chrome.storage.local.set({'auto_connect': GUI.auto_connect});
        });
    });
    
    chrome.storage.local.get('disable_quickjoin', function(result) {
        if (typeof result.disable_quickjoin !== 'undefined') {
            GUI.disable_quickjoin = result.disable_quickjoin;
        }
    });
    
    PortHandler.initialize();
});

function onOpen(openInfo) {
    if (openInfo) {
        // store time for module startup speed tracking
        var port_opened_time = microtime();
        
        // update bitrate because selected bitrate might not be supported, and this is the real value that port was opened with
        GUI.bitrate = openInfo.bitrate;
        
        GUI.log('Serial port <span style="color: green">successfully</span> opened with ID: ' + openInfo.connectionId);
        
        // define inline functions first as some code below isn't asynchronous
        var check_for_32u4 = function() {
            if (GUI.optional_usb_permissions) {
                chrome.usb.getDevices(usbDevices.atmega32u4, function(result) {
                    if (result.length > 0) {
                        serial.disconnect(function(result) {
                            if (result) {
                                // opening port at 1200 baud rate, sending nothing, closing == mcu in programmer mode
                                serial.connect(GUI.connecting_to, {bitrate: 1200}, function(openInfo) {
                                    if (openInfo) {
                                        serial.disconnect(function(result) {
                                            if (result) {
                                                // disconnected succesfully, now we will wait/watch for new serial port to appear
                                                PortHandler.port_detected('port_handler_search_atmega32u4_prog_port', function(new_ports) {
                                                    if (new_ports) {
                                                        serial.connect(new_ports[0], {bitrate: 57600}, function(openInfo) {                                                                            
                                                            if (openInfo) {                                                                
                                                                // connected to programming port, send programming mode exit
                                                                var bufferOut = new ArrayBuffer(1);
                                                                var bufferView = new Uint8Array(bufferOut);
                                                                
                                                                bufferView[0] = 0x45; // exit bootloader
                                                                
                                                                // send over the actual data
                                                                serial.send(bufferOut, function(result) {
                                                                    serial.disconnect(function(result) {
                                                                        if (result) {
                                                                            // disconnected succesfully
                                                                            var time_of_disconnect = microtime();
                                                                            
                                                                            // reset port open time as we had to execure reboot routine, so regular time wouldn't match
                                                                            port_opened_time = microtime();
                                                                            
                                                                            PortHandler.port_detected('port_handler_search_atmega32u4_regular_port', function(new_ports) {
                                                                                if (new_ports) {
                                                                                    for (var i = 0; i < new_ports.length; i++) {
                                                                                        if (new_ports[i] == GUI.connecting_to) {
                                                                                            // port matches previously selected port, continue connection procedure                                                                                    
                                                                                            // open the port while mcu is starting
                                                                                            serial.connect(GUI.connecting_to, {bitrate: GUI.bitrate}, function(openInfo) {
                                                                                                if (openInfo) {
                                                                                                    // log delay between disconnecting from programming port and connecting to regular port
                                                                                                    // If this time goes close or over 2 seconds, we have a problem, keep an eye on this one while
                                                                                                    // changing timeouts for port handler, new version of arduino drivers, and keep in mind delays of slower machines
                                                                                                    if (debug) console.log('ATmega32u4 standard port caught in: ' + (microtime() - time_of_disconnect).toFixed(4) + ' seconds');
                                                                                                    
                                                                                                    standard_connect_procedure();
                                                                                                } else {
                                                                                                    failed_disconnect();
                                                                                                }
                                                                                            });
                                                                                            
                                                                                            // Since we found what we were looking for, we won't continue
                                                                                            break;
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    // reset the connect button back to "disconnected" state
                                                                                    $('div#port-picker a.connect').text('Connect').removeClass('active');
                                                                                    $('div#port-picker a.connect').data("clicks", false);
                                                                                    
                                                                                    // unlock port select & baud (if condition allows it)
                                                                                    $('div#port-picker #port').prop('disabled', false);
                                                                                    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                                                                                    GUI.log('Regular ATmega32u4 port <span style="color: red">not</span> found, connecting <span style="color: red">failed</span>');
                                                                                }
                                                                            }, 10000);
                                                                        } else {
                                                                            failed_disconnect();
                                                                        }
                                                                    });
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        // reset the connect button back to "disconnected" state
                                                        $('div#port-picker a.connect').text('Connect').removeClass('active');
                                                        $('div#port-picker a.connect').data("clicks", false);
                                                        
                                                        // unlock port select & baud (if condition allows it)
                                                        $('div#port-picker #port').prop('disabled', false);
                                                        if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                                                        GUI.log('Programmer ATmega32u4 port <span style="color: red">not</span> found, connecting <span style="color: red">failed</span>');
                                                    }
                                                }, 8000);
                                            } else {
                                                failed_disconnect();
                                            }
                                        });
                                    } else {
                                        failed_connect();
                                    }
                                });
                            } else {
                                failed_disconnect();
                            }
                        });
                    } else {
                        standard_connect_procedure();
                    }
                });
            } else {
                standard_connect_procedure();
            }
        };
        
        var standard_connect_procedure = function() {
            console.log('Started listening for startup message after: ' + (microtime() - port_opened_time).toFixed(4) + ' seconds');
            
            // we might consider to flush the receive buffer when dtr gets triggered (chrome.serial.flush is broken in API v 31)
            var startup_message_buffer = "";
            
            GUI.timeout_add('startup', function() {
                $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                GUI.log('Start message <span style="color: red;">not</span> received within 10 seconds, disconnecting.');
            }, 10000);
            
            serial.onReceive.addListener(function startup_listener(info) {
                var data = new Uint8Array(info.data);
                
                // run through the data/chars received
                for (var i = 0; i < data.length; i++) {
                    if (data[i] != 13) { // CR
                        if (data[i] != 10) { // LF
                            startup_message_buffer += String.fromCharCode(data[i]);
                        } else {           
                            if (startup_message_buffer != "" && startup_message_buffer.length > 2) { // empty lines and messages shorter then 2 chars get ignored here
                                GUI.log('Module - ' + startup_message_buffer);
                            }
                        
                            // reset buffer
                            startup_message_buffer = "";
                        }
                        
                        // compare buffer content "on the fly", this check is ran after each byte
                        if (startup_message_buffer == "OpenLRSng TX starting") {
                            GUI.timeout_remove('startup'); // make sure any further data gets processed by this timer
                            GUI.connected_to = GUI.connecting_to;
                            GUI.connecting_to = false;
                            GUI.module = 'TX';
                            
                            // save last used port in local storage
                            chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                                if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                            });
                            
                            // module is up, we have ~200 ms to join bindMode
                            if (debug) {
                                console.log('OpenLRSng starting message received');
                                console.log('Module Started in: ' + (microtime() - port_opened_time).toFixed(4) + ' seconds');
                            }
                            
                            GUI.log('Module - ' + startup_message_buffer);
                            GUI.log("Requesting to enter bind mode");
                            
                            serial.onReceive.removeListener(startup_listener);
                            serial.onReceive.addListener(read_serial);
                            
                            send("BND!", function() { // Enter bind mode
                                GUI.timeout_add('binary_mode', function() {
                                    send("B", function() { // B char (to join the binary mode on the mcu)
                                        // as neither BND! or B send any reply back, configurator doesn't know if mcu is in bind mode
                                        // unless we get a reply from mcu with PSP_REQ_FW_VERSION, we should always consider that joining bind mode failed
                                        // and handle this condition accordingly.
                                        PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function(result) {
                                            if (!result) {
                                                GUI.log('Communication through Phoenix Serial Protocol was never established, connecting <span style="color: red">failed</span>');
                                                console.log('Command: PSP.PSP_REQ_FW_VERSION timed out, connecting failed');
                                                
                                                // There is nothing we can do, disconnect
                                                $('div#port-picker a.connect').click();
                                            }
                                        }, 2500);
                                    });
                                }, 250); // 250 ms delay (after "OpenLRSng starting" message, mcu waits for 200ms and then reads serial buffer, afterwards buffer gets flushed)
                            });
                            
                            return;
                        } else if (startup_message_buffer == "OpenLRSng RX starting") {
                            GUI.timeout_add('scanner_mode', function() { // wait max 100ms to receive scanner mode message, if not drop out
                                GUI.timeout_remove('startup'); // make sure any further data gets processed by this timer
                                
                                // someone is trying to connect RX with configurator, set him on the correct path and disconnect                                    
                                $('div#port-picker a.connect').click();
                                
                                // tiny delay so all the serial messages are parsed to GUI.log and bus is disconnected
                                GUI.timeout_add('wrong_module', function() {
                                    GUI.log('Are you trying to connect directly to the RX to configure? <span style="color: red">Don\'t</span> do that.\
                                    Please re-read the manual, RX configuration is done <strong>wirelessly</strong> through the TX.');
                                }, 100);
                            }, 100);
                        } else if (startup_message_buffer == "scanner mode") {
                            // if statement above checks for both "scanner mode message" and spectrum analyzer "sample" message which contains quite a few ","
                            // (|| startup_message_buffer.split(",").length >= 5) is currently disabled, which breaks non-dtr configurations
                            // as there seems to be some sort of receive buffer overflow (most likely on chrome side)
                            GUI.timeout_remove('startup');
                            GUI.timeout_remove('scanner_mode');
                            GUI.connected_to = GUI.connecting_to;
                            GUI.connecting_to = false;
                            GUI.module = 'RX';
                            
                            // save last used port in local storage
                            chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                                if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                            });
                            
                            // change connect/disconnect button from "connecting" status to disconnect
                            $('div#port-picker a.connect').text('Disconnect').addClass('active');

                            // remove previous listener
                            serial.onReceive.removeListener(startup_listener);
                            
                            GUI.operating_mode = 3; // spectrum analyzer
                            serial.onReceive.addListener(read_serial);
                            GUI.unlock(2); // unlock spectrum analyzer tab
                            
                            // define frequency limits (we really need to remove this... !!!)
                            hw_frequency_limits(0);
                            
                            // open SA tab
                            $('#tabs li a').eq(2).click();
                            
                            return;
                        }
                    }
                }
            });
        };
        
        var failed_connect = function() {
            // reset the connect button back to "disconnected" state
            $('div#port-picker a.connect').text('Connect').removeClass('active');
            $('div#port-picker a.connect').data("clicks", false);
            
            // unlock port select & baud (if condition allows it)
            $('div#port-picker #port').prop('disabled', false);
            if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

            if (debug) console.log('Failed to open serial port');
            GUI.log('<span style="color: red">Failed</span> to open serial port');
        };
        
        var failed_disconnect = function() {
            // reset the connect button back to "disconnected" state
            $('div#port-picker a.connect').text('Connect').removeClass('active');
            $('div#port-picker a.connect').data("clicks", false);
            
            // unlock port select & baud (if condition allows it)
            $('div#port-picker #port').prop('disabled', false);
            if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);
            
            if (debug) console.log('Failed to close serial port');
            GUI.log('<span style="color: red">Failed</span> to close serial port');
        };
        
        
        if (!GUI.disable_quickjoin) {
            // quick join (for modules that are already in bind mode and modules connected through bluetooth)
            console.log('Trying to connect via quick join');
            serial.onReceive.addListener(read_serial);
            
            send("B", function() { // B char (to join the binary mode on the mcu)
                PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function(result) {
                    if (result) {
                        console.log('Quick join success');
                        GUI.connected_to = GUI.connecting_to;
                        GUI.connecting_to = false;
                        GUI.module = 'TX';
                        
                        // save last used port in local storage
                        chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                            if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                        });
                    } else {
                        console.log('Quick join expired');
                        serial.onReceive.removeListener(read_serial); // standard connect sequence uses its own listener
                        
                        // continue
                        check_for_32u4();
                    }
                }, 250);
            });
        } else {
            check_for_32u4();
        }
    } else {
        // reset the connect button back to "disconnected" state
        $('div#port-picker a.connect').text('Connect').removeClass('active');
        $('div#port-picker a.connect').data("clicks", false);
        
        // unlock port select & baud (if condition allows it)
        $('div#port-picker #port').prop('disabled', false);
        if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);
        
        if (debug) console.log('Failed to open serial port');
        GUI.log('<span style="color: red">Failed</span> to open serial port');
    } 
}

function onClosed(result) {
    if (result) { // All went as expected
        GUI.log('Serial port <span style="color: green">successfully</span> closed');
    } else { // Something went wrong
        GUI.log('<span style="color: red">Failed</span> to close serial port');
    }    
}

function read_serial(info) {
    if (GUI.operating_mode >= 0 && GUI.operating_mode < 3) { // configurator
        PSP.read(info);
    } else if (GUI.operating_mode == 3) { // spectrum analyzer
        SA.read(info);
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
    
    serial.send(bufferOut, function(writeInfo) {
        if (writeInfo.bytesSent > 0) {
            if (callback) {
                callback();
            }
        }
    }); 
}
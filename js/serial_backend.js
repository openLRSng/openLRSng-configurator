var connectionId = -1;

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
                    
                    // lock port select & baud while we are connecting / connected
                    $('div#port-picker #port, div#port-picker #baud').prop('disabled', true);
                    $('div#port-picker a.connect').text('Connecting'); 
                    
                    // We need to check if we are dealing with standard usb to serial adapter or virtual serial
                    // before we open the port, as standard serial adapters support DTR, where virtual serial usually does not.
                    if (GUI.optional_usb_permissions) {
                        chrome.usb.getDevices(usbDevices.atmega32u4, function(result) {
                            if (result.length > 0) {
                                // opening port at 1200 baud rate, sending nothing, closing == mcu in programmer mode
                                chrome.serial.open(selected_port, {bitrate: 1200}, function(result) {
                                    if (result.connectionId > 0) {
                                        chrome.serial.close(result.connectionId, function(result) {
                                            if (result) {
                                                // disconnected succesfully, now we will wait/watch for new serial port to appear
                                                if (debug) console.log('atmega32u4 was switched to programming mode via 1200 baud trick');
                                                PortHandler.port_detected('port_handler_search_atmega32u4_prog_port', function(new_ports) {
                                                    if (new_ports) {
                                                        if (debug) console.log('atmega32u4 programming port found, sending exit bootloader command');
                                                        
                                                        chrome.serial.open(new_ports[0], {bitrate: 57600}, function(openInfo) {                                                                            
                                                            if (openInfo.connectionId > 0) {
                                                                connectionId = openInfo.connectionId;
                                                                
                                                                // connected to programming port, send programming mode exit
                                                                var bufferOut = new ArrayBuffer(1);
                                                                var bufferView = new Uint8Array(bufferOut);
                                                                
                                                                bufferView[0] = 0x45; // exit bootloader
                                                                
                                                                // send over the actual data
                                                                chrome.serial.write(connectionId, bufferOut, function(result) {
                                                                    chrome.serial.close(connectionId, function(result) {
                                                                        if (result) {
                                                                            // disconnected succesfully
                                                                            connectionId = -1; // reset connection id
                                                                            
                                                                            PortHandler.port_detected('port_handler_search_atmega32u4_regular_port', function(new_ports) {
                                                                                for (var i = 0; i < new_ports.length; i++) {
                                                                                    if (new_ports[i] == selected_port) {
                                                                                        // port matches previously selected port, continue connection procedure                                                                                    
                                                                                        if (debug) console.log('atmega32u4 regular port detected after restart, connecting to it');
                                                                                        
                                                                                        // open the port while mcu is starting
                                                                                        chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                                                                                    }
                                                                                }
                                                                            }, false);
                                                                        } else {
                                                                            // failed to disconnect
                                                                            // (not sure if the following procedure is valid), as clicking on "connect" to "disconnect" and reset button state
                                                                            // would also faild (the close sequence would) as current close operation failed
                                                                            
                                                                            $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                                                                            if (debug) console.log('There was a problem while closing the connection');
                                                                            command_log('<span style="color: red">Failed</span> to close serial port');
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

                                                        if (debug) console.log('atmega32u4 port not found within 8 seconds');
                                                        command_log('Regular atmega32u4 port <span style="color: red">not</span> found, connecting <span style="color: red">failed</span>');
                                                    }
                                                }, 8000);
                                            } else {
                                                // reset the connect button back to "disconnected" state
                                                $('div#port-picker a.connect').text('Connect').removeClass('active');
                                                $('div#port-picker a.connect').data("clicks", false);
                                                
                                                // unlock port select & baud (if condition allows it)
                                                $('div#port-picker #port').prop('disabled', false);
                                                if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);
                                                
                                                if (debug) console.log('Failed to close serial port');
                                                command_log('<span style="color: red">Failed</span> to close serial port');
                                            }
                                        });
                                    } else {
                                        // reset the connect button back to "disconnected" state
                                        $('div#port-picker a.connect').text('Connect').removeClass('active');
                                        $('div#port-picker a.connect').data("clicks", false);
                                        
                                        // unlock port select & baud (if condition allows it)
                                        $('div#port-picker #port').prop('disabled', false);
                                        if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                                        if (debug) console.log('Failed to open serial port');
                                        command_log('<span style="color: red">Failed</span> to open serial port');
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
                        GUI.interval_kill_all(['port_handler']); // kept alive
                        PSP.packet_state = 0; // (this is only required if user hot-disconnect)
                        PSP.callbacks = []; // empty PSP callbacks array (this is only required if user hot-disconnect)
                        
                        GUI.lock_default();
                        GUI.operating_mode = 0; // we are disconnected
                        GUI.module = false;
                        GUI.connected_to = false;
                        
                        activeProfile = 0; // reset to default
                        
                        chrome.serial.close(connectionId, onClosed);
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
            if (GUI.operating_mode != 2) command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
            else command_log("You <span style=\"color: red\">can't</span> connect to a module while you are in Firmware Flasher, please leave firmware flasher before connecting.");
        }
    }); 
    
    // auto-connect
    chrome.storage.local.get('auto_connect', function(result) {
        if (typeof result.auto_connect === 'undefined') {
            // auto_connect wasn't saved yet, save and push true to the GUI
            chrome.storage.local.set({'auto_connect': true});
            
            GUI.auto_connect = true;
            $('select#baud').val(115200).prop('disabled', true);
        } else {
            if (result.auto_connect) { 
                // enabled by user
                GUI.auto_connect = true;
                
                $('input.auto_connect').prop('checked', true);
                $('input.auto_connect').prop('title', 'Auto-Connect: Enabled - Configurator automatically tries to connect when new serial port is detected');
                
                $('select#baud').val(115200).prop('disabled', true);
            } else { 
                // disabled by user
                GUI.auto_connect = false;
                
                $('input.auto_connect').prop('checked', false);
                $('input.auto_connect').prop('title', 'Auto-Connect: Disabled - User needs to select the correct serial port and click "Connect" button on its own');
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
            
            chrome.storage.local.set({'auto_connect': GUI.auto_connect}, function() {});
        });
    });
    
    PortHandler.initialize();
});

function onOpen(openInfo) {
    if (openInfo.connectionId > 0) {
        connectionId = openInfo.connectionId;
        
        // update connected_to
        GUI.connected_to = GUI.connecting_to;
        
        // reset connecting_to
        GUI.connecting_to = false;
        
        if (debug) console.log('Serial port was opened with ID: ' + connectionId);
        command_log('Serial port <span style="color: green">successfully</span> opened with ID: ' + connectionId);
        
        // quick join (for modules that are already in bind mode and modules connected through bluetooth)
        if (debug) console.log('Trying to connect via quick join');
        GUI.interval_add('serial_read', read_serial, 10, true); // 10ms interval
        
        send("B", function() { // B char (to join the binary mode on the mcu)
            send_message(PSP.PSP_REQ_FW_VERSION, false, false, function() {
                if (GUI.timeout_remove('quick_join')) {
                    if (debug) console.log('Quick join success');
                    
                    // save last used port in local storage
                    chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                        if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                    });
                }
            });
        });
        
        GUI.timeout_add('quick_join', function() { // quick_join timer triggered / expired, we will continue with standard connect procedure
            if (debug) console.log('Quick join expired');
            GUI.interval_remove('serial_read'); // standard connect sequence uses its own read timer
            
            // send DTR (this should reret any standard AVR mcu)
            chrome.serial.setControlSignals(connectionId, {dtr: true}, function(result) {
                if (debug) console.log('Sent DTR');
                
                // we might consider to flush the receive buffer when dtr gets triggered (chrome.serial.flush is broken in API v 31)
                var now = microtime();
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
                                    if (startup_message_buffer == "OpenLRSng TX starting") {
                                        GUI.interval_remove('startup'); // make sure any further data gets processed by this timer
                                        GUI.module = 'TX';
                                        
                                        // save last used port in local storage
                                        chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                                            if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                                        });
                                        
                                        // module is up, we have ~200 ms to join bindMode
                                        if (debug) {
                                            console.log('OpenLRSng starting message received');
                                            console.log('Module Started in: ' + (microtime() - now).toFixed(4) + ' seconds');
                                        }
                                        
                                        command_log('Module - ' + startup_message_buffer);
                                        command_log("Requesting to enter bind mode");
                                        
                                        // start standard (PSP) read timer
                                        GUI.interval_add('serial_read', read_serial, 10, true); // 10ms interval
                                        
                                        send("BND!", function() {
                                            GUI.timeout_add('binary_mode', function() {
                                                send("B", function() { // B char (to join the binary mode on the mcu)
                                                    send_message(PSP.PSP_REQ_FW_VERSION);
                                                });
                                            }, 250); // 250 ms delay (after "OpenLRSng starting" message, mcu waits for 200ms and then reads serial buffer, afterwards buffer gets flushed)
                                        });
                                        
                                        return;
                                    } else if (startup_message_buffer == "OpenLRSng RX starting") {
                                        GUI.timeout_add('scanner_mode', function() { // wait max 100ms to receive scanner mode message, if not drop out
                                            GUI.interval_remove('startup'); // make sure any further data gets processed by this timer
                                            
                                            // someone is trying to connect RX with configurator, set him on the correct path and disconnect                                    
                                            $('div#port-picker a.connect').click();
                                            
                                            // tiny delay so all the serial messages are parsed to command_log and bus is disconnected
                                            GUI.timeout_add('wrong_module', function() {
                                                command_log('Are you trying to connect directly to the RX to configure? <span style="color: red">Don\'t</span> do that.\
                                                Please re-read the manual, RX configuration is done <strong>wirelessly</strong> through the TX.');
                                            }, 100);
                                        }, 100);
                                    } else if (startup_message_buffer == "scanner mode") {
                                        // if statement above checks for both "scanner mode message" and spectrum analyzer "sample" message which contains quite a few ","
                                        // (|| startup_message_buffer.split(",").length >= 5) is currently disabled, which breaks non-dtr configurations
                                        // as there seems to be some sort of receive buffer overflow (most likely on chrome side)
                                        GUI.interval_remove('startup');
                                        GUI.timeout_remove('scanner_mode');
                                        GUI.module = 'RX';
                                        
                                        // save last used port in local storage
                                        chrome.storage.local.set({'last_used_port': GUI.connected_to}, function() {
                                            if (debug) console.log('Saving last used port: ' + GUI.connected_to);
                                        });
                                        
                                        // change connect/disconnect button from "connecting" status to disconnect
                                        $('div#port-picker a.connect').text('Disconnect').addClass('active');
            
                                        GUI.operating_mode = 3; // spectrum analyzer
                                        GUI.interval_add('serial_read', read_serial, 10, true); // 10ms interval, start read timer
                                        GUI.unlock(2); // unlock spectrum analyzer tab
                                        
                                        // define frequency limits (we really need to remove this... !!!)
                                        hw_frequency_limits(0);
                                        
                                        // open SA tab
                                        $('#tabs li a').eq(2).click();
                                        
                                        return;
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
                }, 5, true);
            });
        }, 1000);
    } else {
        // reset the connect button back to "disconnected" state
        $('div#port-picker a.connect').text('Connect').removeClass('active');
        $('div#port-picker a.connect').data("clicks", false);
        
        // unlock port select & baud (if condition allows it)
        $('div#port-picker #port').prop('disabled', false);
        if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);
        
        if (debug) console.log('Failed to open serial port');
        command_log('<span style="color: red">Failed</span> to open serial port');
    } 
}

function onClosed(result) {
    connectionId = -1; // reset connection id
    
    if (result) { // All went as expected
        if (debug) console.log('Serial port successfully closed');
        command_log('Serial port <span style="color: green">successfully</span> closed');
    } else { // Something went wrong
        if (debug) console.log('Failed to close serial port');
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
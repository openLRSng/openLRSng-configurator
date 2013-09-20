var connectionId = -1;

// Get access to the background window object
// This object is used to pass current connectionId to the backround page
// so the onClosed event can close the port for us if it was left opened, without this
// users can experience weird behavior if they would like to access the serial bus afterwards.
chrome.runtime.getBackgroundPage(function(result) {
    backgroundPage = result;
    backgroundPage.app_window = window;
});

$(document).ready(function() {    
    $('div#port-picker a.connect').click(function() {
        if (GUI.connect_lock != true) { // GUI control overrides the user control
            var clicks = $('div#port-picker a.connect').data('clicks');
            
            if (clicks) { // odd number of clicks
                // kill all timers
                GUI.timeout_kill_all();
                GUI.interval_kill_all(['auto-connect']); // auto-connect is kept alive
                
                if (GUI.operating_mode == 3) {                    
                    send("#1,,,,", function() { // #1,,,, (exit command)
                        command_log('Leaving scanner mode');
                        
                        send_message(PSP.PSP_SET_EXIT, 1);
                        GUI.timeout_add('psp_exit', function() {
                            chrome.serial.close(connectionId, onClosed);
                        }, 50);
                    });
                } else {
                    send_message(PSP.PSP_SET_EXIT, 1);
                    GUI.timeout_add('psp_exit', function() {
                        chrome.serial.close(connectionId, onClosed);
                    }, 50);
                }

                GUI.lock_default();
                GUI.operating_mode = 0; // we are disconnected
                GUI.active_tab = -1;
                GUI.connected_to = false;
                
                $('div#port-picker a.connect').text('Connect').removeClass('active');
                
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                
                // load default html
                tab_initialize_default();            
                
                $('div#port-picker a.connect').data("clicks", !clicks);
            } else { // even number of clicks
                var selected_port = String($('div#port-picker .port select').val());
                var selected_baud = parseInt($('div#port-picker #baud').val());
                
                if (selected_port != '0') {
                    if (debug) console.log('Connecting to: ' + selected_port);
                    
                    $('div#port-picker a.connect').text('Connecting'); 
                    
                    chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                    
                    $('div#port-picker a.connect').data("clicks", !clicks);
                } else {
                    command_log('Please select valid serial port');
                }
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
            } else { 
                // disabled by user
                GUI.auto_connect = false;
                
                $('input.auto_connect').prop('checked', false);
            }
        }

        if (debug) console.log('Scanning for new ports...');
        serial_auto_connect();
        
        // bind UI hook to auto-connect checkbos
        $('input.auto_connect').change(function() {
            var result = $(this).is(':checked');
            
            // update GUI object
            GUI.auto_connect = result;
            
            chrome.storage.local.set({'auto_connect': result}, function() {});
        });
    });
});

function serial_auto_connect() {
    var initial_ports = false;
    
    GUI.interval_add('auto-connect', function() {
        chrome.serial.getPorts(function(current_ports) {
            if (initial_ports.length > current_ports.length || !initial_ports) {
                // port got removed or initial_ports wasn't initialized yet
                var removed_ports = _.difference(initial_ports, current_ports);
                if (debug & initial_ports != false) console.log('Port removed: ' + removed_ports);
                
                // disconnect "UI" if necessary
                if (GUI.connected_to != false & removed_ports[0] == GUI.connected_to) {
                    $('div#port-picker a.connect').click();
                }
                
                // refresh COM port list
                update_port_select_menu(current_ports);
                
                // reset initial_ports
                initial_ports = current_ports;
            }
            
            var new_ports = _.difference(current_ports, initial_ports);
            
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
                if (GUI.auto_connect && !GUI.connected_to) {
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
    $('div#port-picker .port select').html(''); // dump previous one (if there is any)
    
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
        GUI.connected_to = String($('div#port-picker .port select').val());
        
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
                                    // LF received, compare received data
                                    if (startup_message_buffer == "OpenLRSng starting") {
                                        // module is up, we have ~200 ms to join bindMode
                                        if (debug) console.log('OpenLRSng starting message received');
                                        if (debug) console.log('Module Started in: ' + (microtime() - now).toFixed(4) + ' seconds');
                                        command_log('Module - ' + startup_message_buffer);
                                        command_log("Requesting to enter bind mode");
                                        
                                        GUI.interval_remove('startup');
                                        
                                        // start standard (PSP) read timer
                                        GUI.interval_add('serial_read', read_serial, 1, true);
                                        
                                        send("BND!", function() {
                                            GUI.timeout_add('binary_mode', function() {
                                                send("B", function() { // B char (to join the binary mode on the mcu)
                                                    send_message(PSP.PSP_REQ_FW_VERSION);
                                                });
                                            }, 250); // 250 ms delay (after "OpenLRSng starting" message, mcu waits for 200ms and then reads serial buffer, afterwards buffer gets flushed)
                                        });
                                    } else if (startup_message_buffer == "Entering binary mode") {
                                        GUI.interval_remove('startup');
                                        
                                        // start standard (PSP) read timer
                                        GUI.interval_add('serial_read', read_serial, 1, true);
                                        
                                        send_message(PSP.PSP_REQ_FW_VERSION);
                                    } else {
                                        // module isn't started yet, we will just print out the debug messages (if there are any)
                                        if (startup_message_buffer != "" && startup_message_buffer.length > 2) { // empty lines and messages shorter then 2 chars get ignored here
                                            command_log('Module - ' + startup_message_buffer);
                                        }
                                    }
                                    
                                    // reset buffer
                                    startup_message_buffer = "";
                                }
                            }
                        }
                    }
                });
                
                startup_read_time++; // increased every 5 ms
                if (startup_read_time >= 2000) { // 10 seconds
                    GUI.interval_remove('startup');
                    
                    $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                    
                    command_log('Start message <span style="color: red;">not</span> received within 10 seconds, disconnecting.');
                }
            }, 5);
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
            if (typeof callback !== 'undefined') {
                callback();
            }
        }
    }); 
}
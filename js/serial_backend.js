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
    port_picker = $('div#port-picker .port select');
    baud_picker = $('div#port-picker #baud');
    
    $('div#port-picker a.refresh').click(function() {
        if (debug) console.log("Available port list requested.");
        port_picker.html('');

        chrome.serial.getPorts(function(ports) {
            if (ports.length > 0) {
                // Port list received
                
                ports.forEach(function(port) {
                    $(port_picker).append($("<option/>", {
                        value: port,
                        text: port
                    }));        
                });
                
                chrome.storage.local.get('last_used_port', function(result) {
                    // if last_used_port was set, we try to select it
                    if (typeof result.last_used_port != 'undefined') {
                        // check if same port exists, if it does, select it
                        ports.forEach(function(port) {
                            if (port == result.last_used_port) {
                                $(port_picker).val(result.last_used_port);
                            }
                        });
                    }
                });
            } else {
                $(port_picker).append($("<option/>", {
                    value: 0,
                    text: 'NOT FOUND'
                }));
                
                if (debug) console.log("No serial ports detected");
            }
        });
    });
    
    // software click to refresh port picker select (during initial load)
    $('div#port-picker a.refresh').click();
    
    $('div#port-picker a.connect').click(function() {
        if (GUI.connect_lock != true) { // GUI control overrides the user control
            var clicks = $(this).data('clicks');
            
            selected_port = String($(port_picker).val());
            selected_baud = parseInt(baud_picker.val());
            
            if (selected_port != '0') {
                if (clicks) { // odd number of clicks
                    // kill all timers
                    GUI.interval_kill_all();
                    GUI.timeout_kill_all();
                    
                    if (GUI.operating_mode == 3) {
                        GUI.interval_remove('SA_redraw_plot'); // disable plot re-drawing timer
                        
                        send("#1,,,,", function() { // #1,,,, (exit command)
                            command_log('Leaving scanner mode');
                            
                            send_message(PSP.PSP_SET_EXIT, 1, function() {                    
                                chrome.serial.close(connectionId, onClosed);
                            });
                        });
                    } else {
                        send_message(PSP.PSP_SET_EXIT, 1, function() {                    
                            chrome.serial.close(connectionId, onClosed);
                        });
                    }

                    GUI.lock_all(1);
                    GUI.unlock(3); // unlock about tab
                    GUI.operating_mode = 0; // we are disconnected
                    
                    $(this).text('Connect').removeClass('active');
                } else { // even number of clicks        
                    if (debug) console.log('Connecting to: ' + selected_port);
                    
                    $(this).text('Connecting'); 
                    
                    chrome.serial.open(selected_port, {bitrate: selected_baud}, onOpen);
                }
                
                $(this).data("clicks", !clicks);
            }
        } else {
            command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
        }
    }); 
});

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        var selected_port = String($(port_picker).val());
        
        if (debug) console.log('Connection was opened with ID: ' + connectionId);
        command_log('Connection <span style="color: green">successfully</span> opened with ID: ' + connectionId);
        
        // save selected port with chrome.storage if the port differs
        chrome.storage.local.get('last_used_port', function(result) {
            if (typeof result.last_used_port != 'undefined') {
                if (result.last_used_port != selected_port) {
                    // last used port doesn't match the one found in local db, we will store the new one
                    chrome.storage.local.set({'last_used_port': selected_port}, function() {
                        if (debug) console.log('Last selected port was saved in chrome.storage.');
                    });
                }
            } else {
                // variable isn't stored yet, saving
                chrome.storage.local.set({'last_used_port': selected_port}, function() {
                    if (debug) console.log('Last selected port was saved in chrome.storage.');
                });
            }
        });
        
        // flip DTR and RTS
        chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(result) {
            var now = microtime();
            
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
                                        GUI.interval_add('serial_read', read_serial, 1);
                                        
                                        send("BND!", function() {
                                            GUI.timeout_add('binary_mode', function() {
                                                send([0x42], function() { // B char (to join the binary mode on the mcu)
                                                    send_message(PSP.PSP_REQ_BIND_DATA, 1);
                                                });
                                            }, 300); // 300 ms delay (for some reason this command needs to be delayed, we need to investigate)
                                        });
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
                    
                    command_log("Start message not received within 10 seconds, disconnecting.");
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
    if (result) { // All went as expected
        if (debug) console.log('Connection closed successfully.');
        command_log('<span style="color: green">Successfully</span> closed serial connection');
        
        connectionId = -1; // reset connection id
        GUI.active_tab = -1;
        
        $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
        
        // load default html
        tab_initialize_default();
    } else { // Something went wrong
        if (connectionId > 0) {
            if (debug) console.log('There was an error that happened during "connection-close" procedure');
            command_log('<span style="color: red">Failed</span> to close serial port');
        }
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
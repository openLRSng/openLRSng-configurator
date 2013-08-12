var connectionId = -1;
var connection_delay = 0; // delay which defines "when" will the configurator request configurator data after connection was established

// Get access to the background window object
// This object is used to pass current connectionId to the backround page
// so the onClosed event can close the port for us if it was left opened, without this
// users can experience weird behavior if they would like to access the serial bus afterwards.
var backgroundPage;
chrome.runtime.getBackgroundPage(function(result) {
    backgroundPage = result;
    backgroundPage.connectionId = -1;
});

$(document).ready(function() {
    port_picker = $('div#port-picker .port select');
    baud_picker = $('div#port-picker #baud');
    delay_picker = $('div#port-picker #delay');
    
    $('div#port-picker a.refresh').click(function() {
        console.log("Available port list requested.");
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
                
                console.log("No serial ports detected");
            }
        });
    });
    
    // software click to refresh port picker select (during initial load)
    $('div#port-picker a.refresh').click();
    
    $('div#port-picker a.connect').click(function() {
        var clicks = $(this).data('clicks');
        
        selected_port = String($(port_picker).val());
        selected_baud = parseInt(baud_picker.val());
        connection_delay = parseInt(delay_picker.val());
        
        if (selected_port != '0') {
            if (clicks) { // odd number of clicks
                send_message(PSP.PSP_SET_EXIT, 1, function() {
                    if (TX_data_received == true) {
                        command_log('Jumping out of binary mode.');
                    }
                    
                    chrome.serial.close(connectionId, onClosed);
                    
                    clearTimeout(connection_delay);
                    clearInterval(serial_poll);
                }); 
                
                $(this).text('Connect');
                $(this).removeClass('active');            
            } else { // even number of clicks        
                console.log('Connecting to: ' + selected_port);
                
                chrome.serial.open(selected_port, {
                    bitrate: selected_baud
                }, onOpen);
                
                $(this).text('Disconnect');  
                $(this).addClass('active');
            }
            
            $(this).data("clicks", !clicks);
        }
    }); 
});

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    backgroundPage.connectionId = connectionId; // pass latest connectionId to the background page
    
    if (connectionId != -1) {
        var selected_port = String($(port_picker).val());
        
        console.log('Connection was opened with ID: ' + connectionId);
        
        // save selected port with chrome.storage if the port differs
        chrome.storage.local.get('last_used_port', function(result) {
            if (typeof result.last_used_port != 'undefined') {
                if (result.last_used_port != selected_port) {
                    // last used port doesn't match the one found in local db, we will store the new one
                    chrome.storage.local.set({'last_used_port': selected_port}, function() {
                        // Debug message is currently disabled (we dont need to spam the console log with that)
                        // console.log('Last selected port was saved in chrome.storage.');
                    });
                }
            } else {
                // variable isn't stored yet, saving
                chrome.storage.local.set({'last_used_port': selected_port}, function() {
                    // Debug message is currently disabled (we dont need to spam the console log with that)
                    // console.log('Last selected port was saved in chrome.storage.');
                });
            }
        });
        
        connection_delay = setTimeout(function() {
            // reset PSP state to default (this is required if we are reconnecting)
            packet_state = 0;
            
            // start polling
            serial_poll = setInterval(readPoll, 10);
            
            setTimeout(function() {
                send([0x42], function() { // B char (to join the binary mode on the mcu)
                    send_message(PSP.PSP_REQ_BIND_DATA, 1);
                });
            }, 50);
        }, connection_delay * 1000);  
        
    } else {
        $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
        console.log('There was a problem while opening the connection.');
    } 
}

function onClosed(result) {
    if (result) { // All went as expected
        console.log('Connection closed successfully.');
        
        connectionId = -1; // reset connection id
        backgroundPage.connectionId = connectionId; // pass latest connectionId to the background page
        
        $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
        
        // load default html
        tab_initialize_default();
        
        // reset some variables
        TX_data_received = 0;
    } else { // Something went wrong
        if (connectionId > 0) {
            console.log('There was an error that happened during "connection-close" procedure.');
        }
    }    
}

function readPoll() {
    chrome.serial.read(connectionId, 64, onCharRead);
}


function send(Array, callback) {
    var bufferOut = new ArrayBuffer(Array.length);
    var bufferView = new Uint8Array(bufferOut);
    
    for (var i = 0; i < Array.length; i++) {
        bufferView[i] = Array[i];
    }
    
    chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
        if (writeInfo.bytesWritten > 0) {
            if (typeof callback !== 'undefined') {
                callback();
            }
        }
    }); 
}
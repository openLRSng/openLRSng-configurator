function start_app() {
    chrome.app.window.create('main.html', {
        id: 'main-window',
        // bounds are set inside main.js according to width and height of the content
        resizable: false
    }, function(main_window) {
        main_window.onClosed.addListener(function() {
            // connectionId is passed from the script side through the chrome.runtime.getBackgroundPage refference
            // allowing us to automatically close the port when application shut down
            if (app_window.connectionId != -1) {
                if (window.app_window.GUI.operating_mode == 3) {
                    var bufferOut = new ArrayBuffer(6);
                    var bufView = new Uint8Array(bufferOut);
                    
                    bufView[0] = 0x23;
                    bufView[1] = 0x31;
                    bufView[2] = 0x2C;
                    bufView[3] = 0x2C;
                    bufView[4] = 0x2C;
                    bufView[5] = 0x2C;
                    
                    chrome.serial.write(app_window.connectionId, bufferOut, function(writeInfo) {
                        if (writeInfo.bytesWritten > 0) {
                            console.log('SERIAL: Leaving scanner mode');
                        }
                    });
                }
                
                setTimeout(function() {
                    // We will try to "close" the CLI menu
                    var bufferOut = new ArrayBuffer(7);
                    var bufView = new Uint8Array(bufferOut);
                    
                    bufView[0] = 0xB5;
                    bufView[1] = 0x62;
                    bufView[2] = 199;
                    bufView[3] = 0x01;
                    bufView[4] = 0x00;
                    bufView[5] = 0x01;
                    bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; 

                    // after ESC char is sent out, we close the connection
                    chrome.serial.write(app_window.connectionId, bufferOut, function(writeInfo) {
                        if (writeInfo.bytesWritten > 0) {
                            console.log('SERIAL: Exit command send');
                            
                            chrome.serial.close(app_window.connectionId, function(result) {
                                console.log('SERIAL: Connection closed - ' + result);
                            });
                        }
                    });
                }, 50);
            }
        });
    });
}

chrome.app.runtime.onLaunched.addListener(function() {
    start_app();
});

chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason == 'update') {        
        var manifest = chrome.runtime.getManifest();        
        var options = {
            priority: 0,
            type: 'basic',
            title: 'openLRSng Update',
            message: 'Application just updated to version: ' + manifest.version,
            iconUrl: '/images/icon_128.png',
            buttons: [{'title': 'Click this button to start the application'}]
        };
        
        chrome.notifications.create('openlrsng_update', options, function(notificationId) {
            // empty
        });
    }
});

chrome.notifications.onButtonClicked.addListener(function(notificationId, buttonIndex) {
    if (notificationId == 'openlrsng_update') {
        start_app();
    }
});
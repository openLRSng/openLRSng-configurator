chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('main.html', {
        frame: 'chrome',
        id: 'main-window',
        minWidth: 960,
        maxWidth: 960,
        minHeight: 600,
        maxHeight: 600
    }, function(main_window) {
        main_window.onClosed.addListener(function() {
            // connectionId is passed from the script side through the chrome.runtime.getBackgroundPage refference
            // allowing us to automatically close the port when application shut down
            if (window.app_window.connectionId != -1) {
                // We will try to "close" the CLI menu
                var bufferOut = new ArrayBuffer(6 + 1);
                var bufView = new Uint8Array(bufferOut);
                
                bufView[0] = 0xB5;
                bufView[1] = 0x62;
                bufView[2] = 199;
                bufView[3] = 0x01; // payload length LSB
                bufView[4] = 0x00; // payload length MSB
                bufView[5] = 0x01; // payload
                bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; // crc  

                // after ESC char is sent out, we close the connection
                chrome.serial.write(window.app_window.connectionId, bufferOut, function(writeInfo) {
                    if (writeInfo.bytesWritten > 0) {
                        console.log('CLEANUP: ESC char sent to CLI');
                        
                        chrome.serial.close(window.app_window.connectionId, function() {
                            console.log('CLEANUP: Connection to serial port was left opened after application closed, closing the connection.');
                            window.app_window.connectionId = -1;
                        });
                    }
                });
            }
        });
    });
});
/*
    resizable: false - Keep in mind this only disables the side/corner resizing via mouse, nothing more
    maxWidth / maxHeight - is defined to prevent application reaching maximized state through window manager

    We are setting Bounds through setBounds method after window was created because on linux setting Bounds as
    window.create property seemed to fail, probably because "previous" bounds was used instead according to docs.

    bounds - Size and position of the content in the window (excluding the titlebar).
    If an id is also specified and a window with a matching id has been shown before, the remembered bounds of the window will be used instead.
*/
function start_app() {
    chrome.app.window.create('main.html', {
        id: 'main-window',
        frame: 'chrome',
        resizable: false
    }, function(createdWindow) {
        // set window size
        createdWindow.setBounds({'width': 962, 'height': 625});

        // bind events
        createdWindow.onMaximized.addListener(function() {
            createdWindow.restore();
        });

        createdWindow.onClosed.addListener(function() {
            // connectionId is passed from the script side through the chrome.runtime.getBackgroundPage refference
            // allowing us to automatically close the port when application shut down

            // save connectionId in separate variable before app_window is destroyed
            var connectionId = app_window.serial.connectionId;

            if (connectionId > 0) {
                if (window.app_window.GUI.operating_mode == 3) {
                    var bufferOut = new ArrayBuffer(6);
                    var bufView = new Uint8Array(bufferOut);

                    bufView[0] = 0x23;
                    bufView[1] = 0x31;
                    bufView[2] = 0x2C;
                    bufView[3] = 0x2C;
                    bufView[4] = 0x2C;
                    bufView[5] = 0x2C;

                    chrome.serial.send(connectionId, bufferOut, function(writeInfo) {
                        if (writeInfo.bytesSent > 0) {
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
                    chrome.serial.send(connectionId, bufferOut, function(writeInfo) {
                        if (writeInfo.bytesSent > 0) {
                            console.log('SERIAL: Exit command send');

                            chrome.serial.disconnect(connectionId, function(result) {
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
            title: manifest.name,
            message: chrome.i18n.getMessage('notifications_app_just_updated_to_version', [manifest.version]),
            iconUrl: '/images/icon_128.png',
            buttons: [{'title': chrome.i18n.getMessage('notifications_click_here_to_start_app')}]
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
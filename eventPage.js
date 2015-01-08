/*
    If an id is also specified and a window with a matching id has been shown before, the remembered bounds of the window will be used instead.
*/
'use strict';

function startApplication() {
    var applicationStartTime = new Date().getTime();

    chrome.app.window.create('main.html', {
        id: 'main-window',
        frame: 'chrome',
        innerBounds: {
            minWidth: 960,
            minHeight: 625
        }
    }, function (createdWindow) {
        createdWindow.contentWindow.addEventListener('load', function () {
            createdWindow.contentWindow.catch_startup_time(applicationStartTime);
        });

        createdWindow.onClosed.addListener(function() {
            // connectionId is passed from the script side through the contentWindow refference
            // allowing us to automatically close the port when application shut down

            // save connectionId in separate variable before main window is destroyed
            var connectionId = createdWindow.contentWindow.serial.connectionId;
            var operatingMode = createdWindow.contentWindow.GUI.operating_mode;

            if (connectionId) {
                if (operatingMode == 3) {
                    var bufferOut = new ArrayBuffer(6);
                    var bufView = new Uint8Array(bufferOut);

                    bufView[0] = 0x23;
                    bufView[1] = 0x31;
                    bufView[2] = 0x2C;
                    bufView[3] = 0x2C;
                    bufView[4] = 0x2C;
                    bufView[5] = 0x2C;

                    chrome.serial.send(connectionId, bufferOut, function (writeInfo) {
                        if (writeInfo.bytesSent > 0) {
                            console.log('SERIAL: Leaving scanner mode');
                        }
                    });
                }

                setTimeout(function () {
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
                    chrome.serial.send(connectionId, bufferOut, function (writeInfo) {
                        if (writeInfo.bytesSent > 0) {
                            console.log('SERIAL: Exit command send');

                            chrome.serial.disconnect(connectionId, function (result) {
                                console.log('SERIAL: Connection closed - ' + result);
                            });
                        }
                    });
                }, 50);
            }
        });
    });
}

chrome.app.runtime.onLaunched.addListener(startApplication);

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == 'update') {
        var previousVersionArr = details.previousVersion.split('.'),
            currentVersionArr = chrome.runtime.getManifest().version.split('.');

        // only fire up notification sequence when one of the major version numbers changed
        if (currentVersionArr[0] > previousVersionArr[0] || currentVersionArr[1] > previousVersionArr[1]) {
            chrome.storage.local.get('update_notify', function (result) {
                if (typeof result.update_notify === 'undefined' || result.update_notify) {
                    var manifest = chrome.runtime.getManifest();
                    var options = {
                        priority: 0,
                        type: 'basic',
                        title: manifest.name,
                        message: chrome.i18n.getMessage('notifications_app_just_updated_to_version', [manifest.version]),
                        iconUrl: '/images/icon_128.png',
                        buttons: [{'title': chrome.i18n.getMessage('notifications_click_here_to_start_app')}]
                    };

                    chrome.notifications.create('openlrsng_update', options, function (notificationId) {
                        // empty
                    });
                }
            });
        }
    }
});

chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
    if (notificationId == 'openlrsng_update') {
        startApplication();
    }
});
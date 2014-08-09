'use strict';

var usbDevices = {
    atmega32u4: {"vendorId": 9025, "productId": 32822},
    cp2102:     {"vendorId": 4292, "productId": 60000},
    ftdi:       {"vendorId": 1027, "productId": 24577}
};

var usbPermissions = {permissions: [{'usbDevices': [usbDevices.atmega32u4, usbDevices.cp2102, usbDevices.ftdi]}]};

function check_usb_permissions(callback) {
    chrome.permissions.contains(usbPermissions, function(result) {
        if (result) {
            GUI.optional_usb_permissions = true;
        } else {
            console.log('Optional USB permissions: missing');
            GUI.log(chrome.i18n.getMessage('please_grant_usb_permissions'));

            // display optional usb permissions request box
            $('div.optional_permissions').show();

            // UI hooks
            document.getElementById("requestOptionalPermissions").addEventListener('click', function() {
                chrome.permissions.request(usbPermissions, function(result) {
                    if (result) {
                        GUI.log(chrome.i18n.getMessage('usb_permissions_granted'));
                        $('div.optional_permissions').hide();

                        GUI.optional_usb_permissions = true;
                    }
                });
            });
        }

        if (callback) callback();
    });
}
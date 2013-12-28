var usbDevices = {
    atmega32u4: {"vendorId": 9025, "productId": 32822},
    cp2102:     {"vendorId": 4292, "productId": 60000},
    ftdi:       {"vendorId": 1027, "productId": 24577}
};

var usbPermissions = {permissions: [{'usbDevices': [usbDevices.atmega32u4, usbDevices.cp2102, usbDevices.ftdi]}]};

function check_usb_permissions() {
    chrome.permissions.contains(usbPermissions, function(result) {
        if (result) {
            if (debug) console.log('Optional USB permissions: granted');
            
            GUI.optional_usb_permissions = true;
        } else {
            if (debug) console.log('Optional USB permissions: missing');
            command_log('Please click on <strong>"Request Optional Permissions"</strong> button to grant application <strong style="color: red">required</strong> <strong>USB</strong> access.');
            
            // display optional usb permissions request box
            $('div.optional_permissions').show();
            
            // UI hooks
            document.getElementById("requestOptionalPermissions").addEventListener('click', function() {
                chrome.permissions.request(usbPermissions, function(result) {
                    if (result) {
                        command_log('Optional <strong>USB</strong> permissions <strong style="color: green">granted</strong>.');
                        $('div.optional_permissions').hide();
                        
                        GUI.optional_usb_permissions = true;
                    } else {
                        // nothing
                    }
                });
            });
        }
    });
}
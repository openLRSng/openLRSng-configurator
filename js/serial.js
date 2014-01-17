var serial = {
    connectionId: -1,
    
    connect: function() {
    },
    disconnect: function() {
    },
    getDevices: function(callback) {
        chrome.serial.getDevices(function(devices_array) {
            var devices = [];
            devices_array.forEach(function(device) {
                devices.push(device.path);
            });
            
            callback(devices);
        });
    }
};
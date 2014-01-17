function port_handler() {
    this.initial_ports = false;
    
    this.port_detected_callbacks = [];
    this.port_removed_callbacks = [];
}

port_handler.prototype.initialize = function() {
    var self = this;
    if (debug) console.log('Scanning for new ports...');
    
    // 250ms refresh interval, fire instantly after creation
    GUI.interval_add('port_handler', function() {
        serial.getDevices(function(current_ports) {
            // port got removed or initial_ports wasn't initialized yet
            if (self.initial_ports.length > current_ports.length || !self.initial_ports) {
                var removed_ports = array_difference(self.initial_ports, current_ports);
                
                if (debug & self.initial_ports != false) {
                    if (removed_ports.length > 1) {
                        console.log('Ports removed: ' + removed_ports);
                    } else {
                        console.log('Port removed: ' + removed_ports[0]);
                    }
                }
                
                // disconnect "UI" if necessary
                if (GUI.connected_to) {
                    for (var i = 0; i < removed_ports.length; i++) {
                        if (removed_ports[i] == GUI.connected_to) {
                            $('div#port-picker a.connect').click();
                        }
                    }
                }
                
                self.update_port_select(current_ports);
                
                // trigger callbacks (only after initialization)
                if (self.initial_ports) {
                    for (var i = 0; i < self.port_removed_callbacks.length; i++) {
                        var obj = self.port_removed_callbacks[i];
                        
                        // remove timeout
                        GUI.timeout_remove(obj.name);
                        
                        // trigger callback
                        obj.code(removed_ports);
                    }
                    self.port_removed_callbacks = []; // drop references
                }
                
                // auto-select last used port (only during initialization)
                if (!self.initial_ports) {
                    chrome.storage.local.get('last_used_port', function(result) {
                        // if last_used_port was set, we try to select it
                        if (result.last_used_port) {                            
                            current_ports.forEach(function(port) {
                                if (port == result.last_used_port) {
                                    if (debug) console.log('Selecting last used port: ' + result.last_used_port);
                                    
                                    $('div#port-picker .port select').val(result.last_used_port);
                                }
                            });
                        } else {
                            if (debug) console.log('Last used port wasn\'t saved "yet", auto-select disabled.');
                        }
                    });
                }
                
                self.initial_ports = current_ports;
            }
            
            // new port detected
            var new_ports = array_difference(current_ports, self.initial_ports);
            
            if (new_ports.length) {
                if (new_ports.length > 1) {
                    if (debug) console.log('Ports found: ' + new_ports);
                } else {
                    if (debug) console.log('Port found: ' + new_ports[0]);
                }
                
                self.update_port_select(current_ports);
                
                // select / highlight new port, if connected -> select connected port
                if (!GUI.connected_to) {
                    $('div#port-picker .port select').val(new_ports[0]);
                } else {   
                    $('div#port-picker .port select').val(GUI.connected_to);
                }
                
                // start connect procedure (if statement is valid)
                if (GUI.auto_connect && !GUI.connecting_to && !GUI.connected_to) {
                    if (GUI.operating_mode != 2) { // if we are inside firmware flasher, we won't auto-connect
                        GUI.timeout_add('auto-connect_timeout', function() {
                            $('div#port-picker a.connect').click();
                        }, 50); // small timeout so we won't get any nasty connect errors due to system initializing the bus
                    }
                }
                
                // trigger callbacks
                for (var i = 0; i < self.port_detected_callbacks.length; i++) {
                    var obj = self.port_detected_callbacks[i];
                    
                    // remove timeout
                    GUI.timeout_remove(obj.name);
                    
                    // trigger callback
                    obj.code(new_ports);
                }
                self.port_detected_callbacks = []; // drop references
                
                self.initial_ports = current_ports;
            }
        });
    }, 250, true);
};

port_handler.prototype.update_port_select = function(ports) {
    $('div#port-picker .port select').html(''); // drop previous one
    
    if (ports.length > 0) {
        for (var i = 0; i < ports.length; i++) {
            $('div#port-picker .port select').append($("<option/>", {value: ports[i], text: ports[i]}));
        }
    } else {
        $('div#port-picker .port select').append($("<option/>", {value: 0, text: 'NOT FOUND'}));
    }  
};

port_handler.prototype.port_detected = function(name, code, timeout) {
    var self = this;
    var obj = {'name': name, 'code': code, 'timeout': timeout};
    
    if (timeout) {
        GUI.timeout_add(name, function() {
            if (debug) console.log('PortHandler - port detected timeout triggered - ' + obj.name);
        
            // trigger callback
            code(false);
            
            // reset callback array
            self.port_detected_callbacks = [];
        }, timeout);
    }
    
    this.port_detected_callbacks.push(obj);
};

port_handler.prototype.port_removed = function(name, code, timeout) {
    var self = this;
    var obj = {'name': name, 'code': code, 'timeout': timeout};
    
    if (timeout) {
        GUI.timeout_add(name, function() {
            if (debug) console.log('PortHandler - port removed timeout triggered - ' + obj.name);
            
            // trigger callback
            code(false);
            
            // reset callback array
            self.port_removed_callbacks = [];
        }, timeout);
    }
    
    this.port_removed_callbacks.push(obj);
};

var PortHandler = new port_handler();
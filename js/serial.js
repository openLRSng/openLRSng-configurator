var serial = {
    connectionId: -1,
    bytes_received: 0,
    bytes_sent: 0,

    transmitting: false,
    output_buffer: [],

    cancel_connect: false,
    dtr_rts_timeout: undefined,

    connect: function(path, options, callback) {
        var self = this;

        chrome.serial.connect(path, options, function(connectionInfo) {
            if (connectionInfo !== undefined) {
                self.connectionId = connectionInfo.connectionId;
                self.bytes_received = 0;
                self.bytes_sent = 0;
                self.cancel_connect = false; // used to ensure that callback chain stops after dtr_rts timer is killed

                self.onReceive.addListener(function log_bytes_received(info) {
                    self.bytes_received += info.data.byteLength;
                });

                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                    console.error(info);
                    ga_tracker.sendEvent('Error', 'Serial', info.error);

                    // valid conditions are 'disconnected', 'timeout', 'device_lost', 'system_error'
                    if (info.error == 'system_error') {
                        // we might be able to recover from this one
                        chrome.serial.setPaused(self.connectionId, false, function() {
                            console.log('SERIAL: Connection unpause after onReceiveError triggered');
                        });
                    }
                });

                console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', Baud: ' + connectionInfo.bitrate);

                // send DTR & RTS (this should reret any module with either DTR or RTS hooked up to reset pin)
                // minimum pulse width for ATmega328 2 2.5 us, however most of the units have a pullup and a cap on the reset line
                function pre_up() {
                    serial.setControlSignals({'dtr': true, 'rts': true}, down);
                }

                function down() {
                    if (!self.cancel_connect) {
                        self.dtr_rts_timeout = setTimeout(function() {
                            serial.setControlSignals({'dtr': false, 'rts': false}, up);
                        }, 20);
                    }
                }

                function up() {
                    if (!self.cancel_connect) {
                        self.dtr_rts_timeout = setTimeout(function() {
                            serial.setControlSignals({'dtr': true, 'rts': true}, done);
                        }, 20);
                    }
                }

                function done() {
                    if (!self.cancel_connect) callback(connectionInfo);
                }

                // begin reboot sequence
                pre_up();
            } else {
                console.log('SERIAL: Failed to open serial port');
                ga_tracker.sendEvent('Error', 'Serial', 'FailedToOpen');
                callback(false);
            }
        });
    },
    disconnect: function(callback) {
        var self = this;

        // remove dtr/rts timeout in case its still running
        clearTimeout(self.dtr_rts_timeout);

        // cancel callback chain (if needed)
        self.cancel_connect = true;

        // dump the output buffer
        self.empty_output_buffer();

        // remove listeners
        for (var i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
            self.onReceive.removeListener(self.onReceive.listeners[i]);
        }

        for (var i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
            self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
        }

        if (this.connectionId > 0) {
            chrome.serial.disconnect(this.connectionId, function(result) {
                if (result) {
                    console.log('SERIAL: Connection with ID: ' + self.connectionId + ' closed');
                } else {
                    console.log('SERIAL: Failed to close connection with ID: ' + self.connectionId + ' closed');
                    ga_tracker.sendEvent('Error', 'Serial', 'FailedToClose');
                }

                console.log('SERIAL: Statistics - Sent: ' + self.bytes_sent + ' bytes, Received: ' + self.bytes_received + ' bytes');

                self.connectionId = -1;

                callback(result);
            });
        } else {
            callback(false);
        }
    },
    getDevices: function(callback) {
        chrome.serial.getDevices(function(devices_array) {
            var devices = [];
            devices_array.forEach(function(device) {
                devices.push(device.path);
            });

            callback(devices);
        });
    },
    setControlSignals: function(signals, callback) {
        chrome.serial.setControlSignals(this.connectionId, signals, callback);
    },
    send: function(data, callback) {
        var self = this;
        self.output_buffer.push({'data': data, 'callback': callback});

        if (!self.transmitting) {
            self.transmitting = true;

            var sending = function() {
                // store inside separate variables in case array gets destroyed
                var data = self.output_buffer[0].data;
                var callback = self.output_buffer[0].callback;

                chrome.serial.send(self.connectionId, data, function(sendInfo) {
                    if (sendInfo) { // make sure data exists because this can end up being undefined if connection closed before
                        callback(sendInfo);
                        self.output_buffer.shift();

                        self.bytes_sent += sendInfo.bytesSent;

                        if (self.output_buffer.length) {
                            // keep the buffer withing reasonable limits
                            while (self.output_buffer.length > 500) {
                                self.output_buffer.pop();
                            }

                            sending();
                        } else {
                            self.transmitting = false;
                        }
                    }
                });
            };

            sending();
        }
    },
    onReceive: {
        listeners: [],

        addListener: function(function_reference) {
            var listener = chrome.serial.onReceive.addListener(function_reference);

            this.listeners.push(function_reference);
        },
        removeListener: function(function_reference) {
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chrome.serial.onReceive.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    onReceiveError: {
        listeners: [],

        addListener: function(function_reference) {
            var listener = chrome.serial.onReceiveError.addListener(function_reference);

            this.listeners.push(function_reference);
        },
        removeListener: function(function_reference) {
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chrome.serial.onReceiveError.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    empty_output_buffer: function() {
        this.output_buffer = [];
        this.transmitting = false;
    }
};
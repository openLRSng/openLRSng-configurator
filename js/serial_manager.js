'use strict';
var sm;

$(document).ready(function() {
	sm = new serial_manager();
});

var serial_manager = function() {
	this.port_picker = $('div#port-picker a.connect');
	this.ac_box = $('input.auto_connect');
	this.baud_sel = $('div#port-picker #baud');
	this.startup_message_buffer = "";
	this.time_of_disconnect = false;
	this.port_opened_time = false;
	this.port_open = false;
	this.init();
};
serial_manager.prototype.read_serial = function(info) {
    if (GUI.operating_mode == 3) {
		// spectrum analyzer
        SA.read(info);
	} else {
		// configurator
        PSP.read(info);
    } 
};
serial_manager.prototype.send = function(data, callback) {
    var bufferOut = new ArrayBuffer(data.length),
        bufferView = new Uint8Array(bufferOut);

    if (typeof data == 'object') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i];
        }
    } else if (typeof data == 'string') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i].charCodeAt(0);
        }
    }

    serial.send(bufferOut, function(writeInfo) {
        if (writeInfo.bytesSent == bufferOut.byteLength) {
            if (callback) {
                callback();
            }
        }
    });
};
serial_manager.prototype.fail = function (errID) {
	var err={
		connect:{msg:'Failed to open serial port', log:'error_failed_to_open_port'},
		disconnect:{msg:'Failed to close serial port', log:'error_failed_to_close_port'},
		no_prog_port:{msg:'no programming port found', log:'error_atmega32u4_programmer_port_not_found'},
		no_reg_port:{msg:'no regular port found', log:'error_atmega32u4_regular_port_not_found'},
		no_fw_psp:{msg:'Command: PSP.PSP_REQ_FW_VERSION timed out, connecting failed', log:'error_no_psp_received'},
		fw_not_supported:{msg:'firmware not supported', log:'firmware_not_supported'}
	};

	GUI.connecting_to = false;
	this.port_open = false;
	this.toggle_port_ctrls(false);
	
	var e = err[errID];
	if (e.msg) {
		console.log(e.msg);
	}
	if (e.log) {
		GUI.log(chrome.i18n.getMessage(e.log));
	}
};
serial_manager.prototype.init = function() {
	var self = this;
	this.port_picker.click(this.port_click_handler.bind(this));
    // auto-connect
    chrome.storage.local.get('auto_connect', this.auto_connect_cb.bind(this));
	// quickjoin
    chrome.storage.local.get('disable_quickjoin', function (result) {
        if (typeof result.disable_quickjoin !== 'undefined') {
            GUI.disable_quickjoin = result.disable_quickjoin;
        }
    });

    PortHandler.initialize();
};
serial_manager.prototype.port_click_handler = function() {
	 // GUI control overrides the user control
	if (GUI.connect_lock || GUI.operating_mode == 2) {
		if (GUI.operating_mode != 2) {
			GUI.log(chrome.i18n.getMessage('error_operation_in_progress'));
		} else {
			GUI.log(chrome.i18n.getMessage('error_cannot_connect_while_in_firmware_flasher'));
		}
		return;
	}
	// manual connect
	if (this.port_open) {
		this.close();
	}else{
		this.open();
	}
};
serial_manager.prototype.toggle_port_ctrls = function(on) {
	if (on) {
		// lock port select & baud while we are connecting / connected
		$('div#port-picker #port, div#port-picker #baud').prop('disabled', true);
		this.port_picker.text(chrome.i18n.getMessage('connecting'));
	} else {
		// reset the connect button back to "disconnected" state
		this.port_picker.removeClass('active').text(chrome.i18n.getMessage('connect'));
		
		// unlock port select & baud (if condition allows it)
		$('div#port-picker #port').prop('disabled', false);
		if (!GUI.auto_connect) {
			$('div#port-picker #baud').prop('disabled', false);
		}
	}
};
serial_manager.prototype.auto_connect_cb = function(result) {
	if (result.auto_connect === 'undefined' || result.auto_connect) {
		// default or enabled by user
		GUI.auto_connect = true;
		this.ac_box.prop('checked', true);
		this.ac_box.attr('title', chrome.i18n.getMessage('auto_connect_enabled'));
		this.baud_sel.val(115200).prop('disabled', true);
	} else {
		// disabled by user
		GUI.auto_connect = false;
		this.ac_box.prop('checked', false);
		this.ac_box.attr('title', chrome.i18n.getMessage('auto_connect_disabled'));
	}

	// bind UI hook to auto-connect checkbox
	var self = this;
	this.ac_box.change(function () {
		GUI.auto_connect = $(this).is(':checked');

		// update title/tooltip
		if (GUI.auto_connect) {
			$(this).attr('title', chrome.i18n.getMessage('auto_connect_enabled'));
			self.baud_sel.val(115200).prop('disabled', true);
		} else {
			$(this).attr('title', chrome.i18n.getMessage('auto_connect_disabled'));
			if (!GUI.connected_to && !GUI.connecting_to) {
				self.baud_sel.prop('disabled', false);
			}
		}

		chrome.storage.local.set({'auto_connect': GUI.auto_connect});
	});
};
serial_manager.prototype.open = function() {
	var selected_port = String($('div#port-picker .port select').val());
	var selected_baud = parseInt(this.baud_sel.val());

	if (selected_port == '0') {
		GUI.log(chrome.i18n.getMessage('error_no_valid_port'));
		return;
	}

	console.log('Connecting to: ' + selected_port + ', baud: ' + selected_baud);
	
	// connecting_to is used in auto-connect to prevent auto-connecting 
	// while we are in the middle of connect procedure
	GUI.connecting_to = selected_port;
	GUI.bitrate = selected_baud;

	this.toggle_port_ctrls(true);
	this.port_open=true;
	
	serial.connect(selected_port, {bitrate: selected_baud}, this.open_cb.bind(this));
};
serial_manager.prototype.open_cb=function(info) {
    if (!info) {
        // reset the connect button back to "disconnected" state
        this.port_picker.text(chrome.i18n.getMessage('connect')).removeClass('active');
        this.port_open = false;

        // unlock port select & baud (if condition allows it)
        this.toggle_port_ctrls(false);
		this.fail('connect');
		return;
	}

	// store time for module startup speed tracking
	this.port_opened_time = microtime();
	this.time_of_disconnect = false;

	// update bitrate because selected bitrate might not be supported, 
	// and this is the real value that port was opened with
	GUI.bitrate = info.bitrate;
	GUI.log(chrome.i18n.getMessage('serial_port_opened', [info.connectionId]));

	if (GUI.disable_quickjoin) {
		this.connect_quick();
	} else {
		this.connect_wrapper();
	}
};
serial_manager.prototype.close = function() {
	var self = this;
	// Run cleanup routine for a selected tab 
	// (not using callback because hot-unplug wouldn't fire)
	GUI.timeout_kill_all();
	GUI.interval_kill_all();
	GUI.tab_switch_cleanup(); 
	PortHandler.flush_callbacks();

	// Send PSP_SET_EXIT after 50 ms 
	// (works with hot-unplug and normal disconnect)
	GUI.timeout_add('psp_exit', function () {
		PSP.send_message(PSP.PSP_SET_EXIT);

		// after 50ms (should be enough for PSP_SET_EXIT to trigger in normal disconnect), 
		// kill all timers, clean callbacks and disconnect from the port 
		// (works in hot-unplug and normal disconnect)
		GUI.timeout_add('exit', function () {
			PSP.disconnect_cleanup();
			GUI.lock_default();
			GUI.operating_mode = 0; // we are disconnected
			GUI.module = false;
			GUI.connecting_to = false;
			GUI.connected_to = false;
			GUI.bitrate = false;

			if (serial.connectionId) {
				// connectionId could be false if user requests 
				// disconnect between 32u4 reboot sequence
				serial.disconnect(self.close_cb);
			}
		}, 50);
	}, 50);

	this.toggle_port_ctrls(false);
	this.port_open = false;
	
	// de-select any selected tabs
	$('#tabs > ul li').removeClass('active');	
	// detach listeners and remove element data
	$('#content').empty();

	// load default html
	tab_initialize_default();
};
serial_manager.prototype.close_cb = function(result) {
	if (result) {
		// All went as expected
		GUI.log(chrome.i18n.getMessage('serial_port_closed'));
	} else { 
		// Something went wrong
		this.fail('disconnect');
	}
};
serial_manager.prototype.startup_listener = function(info) {
	var data = new Uint8Array(info.data);

   // we might consider to flush the receive buffer 
   // when dtr gets triggered (chrome.serial.flush is broken in API v 31)
	//GUI.module = false;
	
	// run through the data/chars received
	for (var i = 0; i < data.length; i++) {
		// only allow valid ASCII characters (0x1F <-> 0x7F) + line feed (0x0A)
		if ((data[i] < 0x1F || data[i] > 0x7F) && data[i] != 0x0A) {
			console.log('Garbage (ignored) on ASCII serial bus: ' + data[i] + ' '  + String.fromCharCode(data[i]));
			continue;
		}
		
		if (data[i] == 10) {
			// LF
			if (this.startup_message_buffer != "" && this.startup_message_buffer.length > 2) { 
				// empty lines and messages shorter then 2 chars get ignored here
				GUI.log(chrome.i18n.getMessage('module_sent', [this.startup_message_buffer]));
			}
			// reset buffer
			this.startup_message_buffer = "";
		} else{
			this.startup_message_buffer += String.fromCharCode(data[i]);
		}
		
		// compare buffer content "on the fly"
		// this check is ran after each byte
		if (this.startup_message_buffer == "OpenLRSng TX starting") {
			GUI.module = 'TX';
		} else if (this.startup_message_buffer == "OpenLRSng RX starting") {
			GUI.module = 'RX';
		}
		
		if (GUI.module) {
			// make sure any further data gets processed by this timer
			GUI.timeout_remove('startup'); 			
			// remove previous listener
			//this.ref=this.startup_listener;
			serial.onReceive.removeListener(this.ref);

			GUI.connected_to = GUI.connecting_to;
			GUI.connecting_to = false;

			// save last used port in local storage
			chrome.storage.local.set({'last_used_port': GUI.connected_to});

			// module is up, we have ~200 ms to join bindMode
			console.log('OpenLRSng starting message received');
			console.log('Module Started in: ' + (microtime() - this.port_opened_time).toFixed(4) + ' seconds');

			GUI.log(chrome.i18n.getMessage('module_sent', [this.startup_message_buffer]));
			GUI.log(chrome.i18n.getMessage('request_to_enter_bind_mode'));
			this.startup_message_buffer = '';
			
			// Enter bind mode
			var self = this;
			GUI.timeout_add('enter_bind', function() {
				self.send("BND!", function () {
					GUI.timeout_add('binary_mode', function () {
						// B char == enter binary mode
						self.send("B", function () {
							self.ref=self.read_serial.bind(self);
							serial.onReceive.addListener(self.ref);
							PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function(result) {
								if (!result) {
									self.close();
									self.fail('no_fw_psp');
									return;
								}
								self.startup_cb();
							}, 2500);
						});
					}, 100); 
				});
			}, 10);
			return;
		}
	}
};
serial_manager.prototype.init_rx_tab = function() {
	PSP.send_message(PSP.PSP_REQ_RX_CONFIG, false, false, function() {
		GUI.unlock(1); 
		GUI.unlock(3);
		GUI.operating_mode = 1;
		$('#tabs li.tab_RX a').click();
	});
};
serial_manager.prototype.init_tx_tab = function() {
	var get_active_profile = function () {
		PSP.send_message(PSP.PSP_REQ_ACTIVE_PROFILE, false, false, get_default_profile);
	}
	var get_default_profile = function () {
		PSP.send_message(PSP.PSP_REQ_DEFAULT_PROFILE, false, false, get_bind_data);
	}
	var get_bind_data = function () {
		PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, load_tx_tab);
	}
	var load_tx_tab = function () {
		GUI.lock_all(0); // unlock all tabs
		GUI.operating_mode = 1; // we are connected
		$('#tabs li.tab_TX a').click(); // open TX tab
	}
	// load_tx_tab();
	PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_active_profile);
};
serial_manager.prototype.startup_cb = function() {
	// change connect/disconnect button 
	// from "connecting" status to disconnect
	this.port_picker.addClass('active').text(chrome.i18n.getMessage('disconnect'));

	if (!initialize_configuration_objects(CONFIGURATOR.firmwareVersionLive)) {
		this.fail('fw_not_supported');
		return;
	}
	if (GUI.module == 'TX') {
		this.init_tx_tab();
	} else {
		this.init_rx_tab();
	}
};
serial_manager.prototype.connect_std = function() {
	var self = this;
	this.startup_message_buffer = '';
	GUI.timeout_add('startup', function () {
		// reset the connect button back to "disconnected" state
		self.port_picker.click(); 
		GUI.log(chrome.i18n.getMessage('error_no_startup_message'));
	}, 10000);
	this.ref = this.startup_listener.bind(this);
	serial.onReceive.addListener(this.ref);
};
serial_manager.prototype.connect_quick = function() {
	var self = this;
   // quick join (for modules that are already in bind mode 
   // and modules connected through bluetooth)
	this.ref = this.read_serial.bind(this);
	serial.onReceive.addListener(this.ref);

	// using this timeout as protection against locked bus 
	// (most likely chrome serial api bug), if sending "B" fails
	// PSP callback with timeout trigger wouldn't trigger
	GUI.timeout_add('send_timeout', function () {
		GUI.log(chrome.i18n.getMessage('error_failed_to_enter_binary_mode'));

		// disconnect
		self.port_picker.click();
	}, 250);

	// B char == enter binary mode
	this.send("B", function() {
		PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function (result) {
			GUI.timeout_remove('send_timeout');
			if (result) {
				console.log('Quick join success');
				GUI.connected_to = GUI.connecting_to;
				GUI.connecting_to = false;
				chrome.storage.local.set({'last_used_port': GUI.connected_to});
				self.connect_quick_cb();
			} else {
				console.log('Quick join expired');
				// standard connect sequence uses its own listener
				serial.onReceive.removeListener(self.ref);
				// continue
				self.connect_wrapper();
			}
		}, 200);
	});
};
serial_manager.prototype.connect_quick_cb = function() {
	var self = this;
	PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, function (result) {
		if (result) {
			GUI.module = 'TX';
		} else {
			GUI.module = 'RX';
		}
		self.startup_cb();
	});
};
serial_manager.prototype.connect_wrapper = function() {
	if (GUI.optional_usb_permissions) {
		// check if 32u4 is present
		this.check_usb_devices();
	} else {	
		this.connect_std();
	}
};
serial_manager.prototype.check_usb_devices = function () {
	var self = this;//
	chrome.serial.getDevices(function(dev){
		if (!dev || !dev.length) {
			self.fail('connect');
			self.close();
		}
		var a=usbDevices.atmega32u4;
		for (var i = 0; i < dev.length; i++) {
			var d = dev[i];
			if ( d.path == GUI.connecting_to && 
					d.productId == a.productId 
					&& d.vendorId == a.vendorId
				)
			{
				// console.log(['ATMega32u4 device found:', d]);
				self.detected_32u4_disconnect();
				return;
			}
		}
		self.connect_std();
	});
};
serial_manager.prototype.detected_32u4_disconnect = function () {
	var self = this;
	serial.disconnect(function (result) {
		if (result) {
			GUI.log(chrome.i18n.getMessage('serial_port_closed'));
			GUI.log(chrome.i18n.getMessage('serial_atmega32u4_reboot_sequence_started'));
			self.opening_port_at_1200();
		} else {
			self.fail('disconnect');
		}
	});
};
serial_manager.prototype.opening_port_at_1200 = function () {
	// opening port at 1200 baud rate, 
	// sending nothing, closing == mcu in programmer mode
	var self = this;

	serial.connect(GUI.connecting_to, {bitrate: 1200}, function (openInfo) {
		if (openInfo) {
			self.closing_port_from_1200();
		} else {
			self.fail('connect');
		}
	});
};
serial_manager.prototype.closing_port_from_1200 = function () {
	var self = this;
	serial.disconnect(function(result) {
		if (result) {
			self.wait_for_programming_port();
		} else {
			self.fail('disconnect');
		}
	});
};
serial_manager.prototype.wait_for_programming_port = function () {
	var self = this;
	PortHandler.port_detected('port_handler_search_atmega32u4_prog_port', function (new_ports) {
		if (new_ports) {
			self.new_port_detected(new_ports);
		} else {
			self.fail('no_prog_port');
		}
	}, 8000);
};
serial_manager.prototype.new_port_detected = function (new_ports) {
	var self = this;
	GUI.timeout_add('initialization_timeout', function () {
		serial.connect(new_ports[0], {bitrate: 57600}, function (openInfo) {
			if (openInfo) {
				self.leave_programming_mode();
			} else {
				self.fail('connect');
			}
		});
	}, 100); // timeout so bus have time to initialize after being detected by the system
};
serial_manager.prototype.leave_programming_mode = function () {
	// connected to programming port, send programming mode exit
	var self = this;
	var bufferOut = new ArrayBuffer(1);
	var bufferView = new Uint8Array(bufferOut);

	bufferView[0] = 0x45; // exit bootloader

	// send over the actual data
	serial.send(bufferOut, function (result) {
		serial.disconnect(function (result) {
			if (result) {
				self.wait_for_regular_port();
			} else {
				self.fail('disconnect');
			}
		});
	});
};
serial_manager.prototype.wait_for_regular_port = function () {
	var self = this;
	
	// disconnected succesfully
	this.time_of_disconnect = microtime();

	// reset port open time as we had to execute reboot routine, so regular time wouldn't match
	// setting port open time to the same as time of prog port disconnect is "wrong", but this is the most accurate
	// tracker of "boot up" time we can get for the atmega32u4
	this.port_opened_time = this.time_of_disconnect;

	PortHandler.port_detected('port_handler_search_atmega32u4_regular_port', function (new_ports) {
		if (new_ports) {
			self.open_regular_port(new_ports);
		} else {
			self.fail('no_reg_port');
		}
	}, 10000);
};
serial_manager.prototype.open_regular_port = function (new_ports) {
	var self = this;
	for (var i = 0; i < new_ports.length; i++) {
		if (new_ports[i] == GUI.connecting_to) {
			// port matches previously selected port, continue connection procedure
			// open the port while mcu is starting
			GUI.timeout_add('initialization_timeout', function () {
				serial.connect(GUI.connecting_to, {bitrate: GUI.bitrate}, function (openInfo) {
					if (openInfo) {
						self.regular_port_opened(openInfo);
					} else {
						self.fail('connect');
					}
				});
			}, 50); // timeout so bus have time to initialize after being detected by the system

			// Since we found what we were looking for, we won't continue
			break;
		}
	}
};
serial_manager.prototype.regular_port_opened = function (openInfo) {
	GUI.log(chrome.i18n.getMessage('serial_port_opened', [openInfo.connectionId]));

	// log delay between disconnecting from programming port and connecting to regular port
	// If this time goes close or over 2 seconds, we have a problem, keep an eye on this one while
	// changing timeouts for port handler, new version of arduino drivers, and keep in mind delays of slower machines
	console.log('ATmega32u4 standard port caught in: ' + (microtime() - this.time_of_disconnect).toFixed(4) + ' seconds');

	this.connect_std();
};

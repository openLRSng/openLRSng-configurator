'use strict';

var RX_tab = new tabRX();

// legacy tab open wrapper
function tab_initialize_rx_module() {
	RX_tab.init();
}

function tabRX() {
	this.connected = false;
	this.connecting = false;
	this.timeoutRetries = 0;
	this.leaving = false;
}

tabRX.prototype.init = function() {
	var self = this;
    if (self.connected) {
        $('#content').load("./tabs/rx_module.html", function(){self.loadUI();});
    } else {
        $('#content').load("./tabs/rx_connecting.html", function(){self.preloadUI();});
    }
};

tabRX.prototype.reset = function() {
	this.connected = false;
	this.connecting = false;
	this.timeoutRetries = 0;
};

tabRX.prototype.exit = function(cb) {
	if (this.connecting) {
		// we are leaving, so cancel any further
		// reconnect attempts
		this.leaving = true;

		if (cb){
			PSP.callbacks.push({'code': PSP.PSP_REQ_RX_JOIN_CONFIGURATION, 'callback': cb});
		}
		sm.send([0x00]); // sending any data in this stage will "break" the timeout
	} else {
		if (cb) {
			cb();
		}
	}
	this.reset();
};

tabRX.prototype.connect = function() {
	console.log('Requesting to join RX wireless configuration');
	GUI.log(chrome.i18n.getMessage('rx_module_try_to_establish_connection'));

	var self = this;
	self.connecting = true;
	PSP.send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, false, false, function(r){self.connectCallback(r);});
};

tabRX.prototype.connectCallback = function (result) {
	this.connecting = false;

	if (GUI.active_tab != 'rx_connecting') {
		console.log('Connection request to the RX was canceled');
		GUI.log(chrome.i18n.getMessage('rx_module_connection_request_canceled'));
		this.reset();
		return;
	}
	
	var connectState = parseInt(result.data.getUint8(0));

	switch (connectState) {
		case 1:
			console.log('Connection to the RX successfully established');
			GUI.log(chrome.i18n.getMessage('rx_module_connection_established_ok'));
			
			var self = this;
			self.connected = true;
			self.timeoutRetries = 0;
			self.getConfig(function(){self.getSpecialPins();});
			break;
		case 2:
			console.log('Connection to the RX timed out');
			
			if (this.timeoutRetries++ > 3) {
				GUI.log(chrome.i18n.getMessage('rx_module_connection_timed_out'));
				$('a.retry').show();
				return;
			}
			
			if (this.leaving) {
				GUI.log(chrome.i18n.getMessage('rx_module_connection_request_canceled'));				
			} else {
				GUI.log(chrome.i18n.getMessage('rx_module_connection_timed_out_retrying'));
				this.connect();
			}
			break;
		case 3:
			console.log('Failed response from the RX module');
			GUI.log(chrome.i18n.getMessage('rx_module_faulty_response'));
			$('a.retry').show();
			break;
	}
};

tabRX.prototype.fileRestoreCallback = function (result) {
	if (result.type != 'RX_configuration_backup') {
		GUI.log(chrome.i18n.getMessage('rx_module_incorrect_data_structure'));
		return;
	}
	
	// validate object properties and object lengths
	var valid = true;
	for (var property in RX_CONFIG) {
		if (!result.obj.hasOwnProperty(property)) {
			valid = false;
			break;
		}
	}

	if (Object.keys(RX_CONFIG).length != Object.keys(result.obj).length) {
		valid = false;
	}
	
	if (!valid) {
		GUI.log(chrome.i18n.getMessage('rx_module_data_structure_invalid'));
		GUI.log(chrome.i18n.getMessage('rx_module_backup_file_generated_on', [result.configurator_version, read_firmware_version(result.firmware_version).str]));
		GUI.log(chrome.i18n.getMessage('rx_module_current_configurator_version', [chrome.runtime.getManifest().version, CONFIGURATOR.firmwareVersionEmbedded[0] + '.' + CONFIGURATOR.firmwareVersionEmbedded[1] + '.' + CONFIGURATOR.firmwareVersionEmbedded[2]]));
		return;
	}

	RX_CONFIG = result.obj;

	var self = this;
	self.sendConfig(function () {
		GUI.log(chrome.i18n.getMessage('rx_module_configuration_restored'));
		self.init();
	});
};

tabRX.prototype.getSpecialPins = function () {
	var self = this;
	PSP.send_message(PSP.PSP_REQ_SPECIAL_PINS, false, false, function(){self.getOutputCount();});
};

tabRX.prototype.getOutputCount = function () {
	var self = this;
	PSP.send_message(PSP.PSP_REQ_NUMBER_OF_RX_OUTPUTS, false, false, function(){self.init();});
};

tabRX.prototype.retryConnection = function() {
	$('a.retry').hide();
	this.timeoutRetries = 0;
	this.connect();
};

tabRX.prototype.preloadUI = function() {
	if (GUI.active_tab != 'rx_connecting') {
		GUI.active_tab = 'rx_connecting';
		googleAnalytics.sendAppView('RX Module');
	}
	localize();
	var self = this;
	$('a.retry').click(function(){self.retryConnection();}).click();
};

tabRX.prototype.loadUI = function() {
	GUI.active_tab = 'rx_module';

	// translate to user-selected language
	localize();

	var rfmType = (RX_CONFIG.rx_type >> 6);
	initializeFrequencyLimits(rfmType);
	
	validate_bounds('input[type="number"]');

	// fill in the values
	if (bit_check(RX_CONFIG.flags, 1)) { // Always Bind
		$('select[name="bind_on_startup"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 0)) { // limit ppm to 8 channels
		$('select[name="limit_ppm"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 2)) { // enable slave mode
		$('select[name="slave_mode"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 3)) { // immediate output
		$('select[name="immediate_output"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 4)) { // static beacon
		$('select[name="static_beacon"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 6)) { // invert PPM output
		$('select[name="invert_ppm_out"]').val(1);
	}

	if (bit_check(RX_CONFIG.flags, 7)) { // watchdog
		$('div.info span.watchdog').html(chrome.i18n.getMessage('rx_module_enabled'));
	} else {
		$('div.info span.watchdog').html(chrome.i18n.getMessage('rx_module_disabled'));
	}

	$('input[name="sync_time"]').val(RX_CONFIG.minsync);
	$('select[name="rssi_inject"]').val(RX_CONFIG.RSSIpwm);

	// failsafe
	$('input[name="failsafe_delay"]').val(RX_CONFIG.failsafe_delay);
	$('input[name="stop_pwm_failsafe"]').val(RX_CONFIG.pwmStopDelay);
	$('input[name="stop_ppm_failsafe"]').val(RX_CONFIG.ppmStopDelay);

	// beacon
	$('div.beacon span.note').prop('title',
		'Supported frequency range: ' + frequencyLimits.minBeacon + ' Hz - ' + frequencyLimits.maxBeacon + ' Hz');

	$('input[name="beacon_frequency"]').val(RX_CONFIG.beacon_frequency);
	$('input[name="beacon_interval"]').val(RX_CONFIG.beacon_interval);
	$('input[name="beacon_deadtime"]').val(RX_CONFIG.beacon_deadtime + 100); // +100 because slider range is 100-355 and variable range is 0-255

	// info
	var board = null;
	switch (RX_CONFIG.rx_type & ~0xC0) {
		case 1:
			board = 'Flytron / OrangeRX 8 channel';
			break;
		case 2:
			board = 'DTF UHF 4 ch. / Hawkeye 6 ch.';
			break;
		case 3:
			board = 'OpenLRSng 12 channel';
			break;
		case 4:
			board = 'DTF UHF 10 channel RX32';
			break;
		case 5:
			board = 'PowerTowerRX';
			break;
		case 6:
			board = 'OpenLRSng microRX';
			break;
		case 7:
			board = 'Flytron/OrangeRX TX as RX';
			break;
		case 8:
			board = 'Broversty RX';
			break;
		default:
			board = chrome.i18n.getMessage('rx_module_unknown');
	}
	$('div.info span.board').html(board);

	// beacon hybrid element
	// go out of range to also capture "disabled"
	$('select[name="beacon_frequency_helper"]').prop('selectedIndex', -1); 
	
	// channel outputs
	$('div.channel_output dl').empty();
	for (var i = 0; i < NUMBER_OF_OUTPUTS_ON_RX; i++) {
		$('div.channel_output dl').append('<dt>Port ' + (i + 1) + '</dt>');
		$('div.channel_output dl').append('<dd><select name="port-' + (i + 1) + '"></select></dd>');

		// select each value according to RX_CONFIG
		var e = $('div.channel_output select').last();		
		this.channelOutputList(e, i);
		e.val(RX_CONFIG.pinMapping[i]);
	}

	// UI Hooks
	this.setupListeners();
};

tabRX.prototype.setupListeners = function() {
	var self = this;

	$('input[name="failsafe_delay"]').on('input', function () {
		self.updateFailsafeSlider(this, $('span.failsafe_delay_val'));
	}).trigger('input');

	$('input[name="stop_pwm_failsafe"]').on('input', function () {
		self.updateFailsafeSlider(this, $('span.stop_pwm_failsafe_val'));
	}).trigger('input');

	$('input[name="stop_ppm_failsafe"]').on('input', function () {
		self.updateFailsafeSlider(this, $('span.stop_ppm_failsafe_val'));
	}).trigger('input');
	
	$('input[name="beacon_interval"]').on('input', function () {
		$('span.beacon_interval_val').html($(this).val() + ' s');
	}).trigger('input');

	$('input[name="beacon_deadtime"]').on('input', function () {
		self.updateFailsafeSlider(this, $('span.beacon_deadtime_val'));
	}).trigger('input');
	
	// reset to out of range position 
	// (user can use value from select, delete value manually and then select the same value)
	$('select[name="beacon_frequency_helper"]').change(function () {
		$('input[name="beacon_frequency"]').val(parseInt($(this).val()));
		$(this).prop('selectedIndex', -1); 
	});

	$('a.save_to_file').click(function () {
		save_object_to_file(RX_CONFIG, 'RX_configuration_backup', function (result) {
			GUI.log(chrome.i18n.getMessage('rx_module_configuration_saved'));
		});
	});

	$('a.edit_failsafe_values').click(function () {
		PSP.send_message(PSP.PSP_REQ_RX_FAILSAFE, false, false, function(r){tab_initialize_rx_failsafe(r);});
	});

	$('a.restore_from_file').click(function(){restore_from_file(function(r){self.fileRestoreCallback(r);});});
	$('a.restore_default').click(function(){self.restoreDefaults();});
	$('a.save_to_eeprom').click(function(){self.saveConfig();});

	var b =$('a.set_bind');
	if(GUI.module == 'TX') {
		b.show().click(function(){self.setBind();});
	} else {
		b.hide();
	}
};

tabRX.prototype.channelOutputList = function(element, index) {
	// standard outputs
	for (var i = 0; i < 16; i++) {
		element.append('<option value="' + i + '">' + (i + 1) + '</option>');
	}

	// special functions
	// we used analog 0 and 1 in this sequence while it was static, we might consider using it again
	for (var i = 0; i < RX_SPECIAL_PINS.length; i++) {
		var data = RX_SPECIAL_PINS[i];
		if (data.pin == index) {
			if (PIN_MAP.hasOwnProperty(data.type)) { // else - list custom functions that aren't supported by current PIN_MAP
				element.append('<option value="' + data.type + '">' + PIN_MAP[data.type] + '</option>');
				if (PIN_MAP[data.type] == 'PPM') {
					element.css('border', '1px solid #08CF30');
				}
			} else {
				element.append('<option value="' + data.type + '">?' + data.type + '?</option>');
			}
		}
	}

	// switches
	for (var i = 0; i < 16; i++) {
		element.append('<option value="' + (i + 16) + '">S' + (i + 1) + '</option>');
	}
};

tabRX.prototype.updateFailsafeSlider = function(slider_element, text_element) {
	// non linear mapping
	// 0 - disabled
	// 1-99    - 100ms - 9900ms (100ms res)
	// 100-189 - 10s  - 99s   (1s res)
	// 190-209 - 100s - 290s (10s res)
	// 210-255 - 5m - 50m (1m res)
	var val = parseInt($(slider_element).val());

	if (val == 0) {
		text_element.html(chrome.i18n.getMessage('rx_module_disabled'));
	} else if (val < 100) {
		val *= 100;
		text_element.html(val + ' ms');
	} else if (val < 190) {
		val = (val - 90);
		text_element.html(val + ' s');
	} else if (val < 210) {
		val = (val - 180) * 10;
		text_element.html(val + ' s');
	} else {
		val = (val - 205);
		text_element.html(val + ' m');
	}
};

tabRX.prototype.getConfig = function (cb) {
	var self = this;
	PSP.send_message(PSP.PSP_REQ_RX_CONFIG, false, false, cb);
};

tabRX.prototype.restoreDefaults = function() {
	if (CONFIGURATOR.readOnly) {
		GUI.log(chrome.i18n.getMessage('running_in_compatibility_mode'));
		return;
	}
	var self = this;
	PSP.send_message(PSP.PSP_SET_RX_RESTORE_DEFAULT, false, false, function(){self.getConfig(function(){self.init();});});
};

tabRX.prototype.getBind = function(cb) {
	
};

tabRX.prototype.sendConfig = function(cb) {
	var self = this;
	var rx_data = PSP.write_struct(STRUCT_PATTERN.RX_CONFIG, RX_CONFIG);
	PSP.send_message(PSP.PSP_SET_RX_CONFIG, rx_data, false, cb);
};

tabRX.prototype.saveEEPROM =function(cb) {
	PSP.send_message(PSP.PSP_SET_RX_SAVE_EEPROM, false, false, cb);
};

tabRX.prototype.setBind = function() {
	if(!BIND_DATA){
		console.log("ERROR: BIND_DATA not set");
		return;
	}
	var self = this;
	var bind_data = PSP.write_struct(STRUCT_PATTERN.BIND_DATA, BIND_DATA);
	PSP.send_message(PSP.PSP_SET_RX_SAVE_BIND, bind_data, false, function(){});
};

tabRX.prototype.saveConfig = function() {
	var validation_result = true;
	var beacon_frequency = parseInt($('input[name="beacon_frequency"]').val());
	var channel_output_port_key = 0;

	// custom beacon frequency validation
	if (beacon_frequency == 0 || (beacon_frequency >= frequencyLimits.minBeacon && beacon_frequency <= frequencyLimits.maxBeacon)) {
		// all valid
		$('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').removeClass('validation_failed');
	} else {
		validation_result = false;
		$('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').addClass('validation_failed');
	}

	if (!validation_result) {
		GUI.log(chrome.i18n.getMessage('rx_module_validation_failed_message_1'));
		GUI.log(chrome.i18n.getMessage('rx_module_validation_failed_message_2'));
	}
	
	// we need to "grasp" all values from the UI, store it in the local RX_CONFIG object
	// send this object to the module and then request EEPROM save
	RX_CONFIG.failsafe_delay = parseInt($('input[name="failsafe_delay"]').val());

	if (parseInt($('select[name="bind_on_startup"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 1);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 1);
	}

	if (parseInt($('select[name="limit_ppm"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 0);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 0);
	}

	if (parseInt($('select[name="invert_ppm_out"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 6);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 6);
	}

	if (parseInt($('select[name="slave_mode"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 2);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 2);
	}

	if (parseInt($('select[name="immediate_output"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 3);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 3);
	}

	if (parseInt($('select[name="static_beacon"]').val()) == 1) {
		RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 4);
	} else {
		RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 4);
	}

	RX_CONFIG.minsync = parseInt($('input[name="sync_time"]').val());
	RX_CONFIG.RSSIpwm = parseInt($('select[name="rssi_inject"]').val());

	RX_CONFIG.pwmStopDelay = parseInt($('input[name="stop_pwm_failsafe"]').val());
	RX_CONFIG.ppmStopDelay = parseInt($('input[name="stop_ppm_failsafe"]').val());

	RX_CONFIG.beacon_frequency = parseInt($('input[name="beacon_frequency"]').val());
	RX_CONFIG.beacon_interval = parseInt($('input[name="beacon_interval"]').val());
	RX_CONFIG.beacon_deadtime = parseInt($('input[name="beacon_deadtime"]').val()) - 100; // -100 because slider range is 100-355 where variable range is 0-255

	$('div.channel_output select').each(function () {
		RX_CONFIG.pinMapping[channel_output_port_key++] = $(this).val();
	});

	var self = this;
	self.sendConfig(function(){self.saveEEPROM();});
};

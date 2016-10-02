'use strict';
var SA;
var global_config={'SA_config':{}};

function tab_initialize_spectrum_analyzer() {
	$('#content').load('./tabs/spectrum_analyzer.html',mainLoader);
}
function mainLoader() {
	if (GUI.active_tab != 'spectrum_analyzer') {
		GUI.active_tab = 'spectrum_analyzer';
		googleAnalytics.sendAppView('Spectrum Analyzer');
	}
	SA = new spectrum_analyzer();
	initFreqConfig();
}
function initFreqConfig() {
	PSP.send_message(PSP.PSP_REQ_SCANNER_MODE, false, false, scannerCallback);
}
function scannerCallback() {
	// GUI mode 3 switches from receive-read timer 
	// to spectrum_analyzer read 'protocol'
	GUI.operating_mode = 3; 
	SA.getSupportedFrequencies(scannerFreqInit);	
	if (GUI.module == 'TX') {
		SA.setHops(new hop_collection(BIND_DATA));
	}
}
function scannerFreqInit() {
		var o = global_config.SA_config;
		if(!o.start_frequency){
			o = {
				'start_frequency' : (SA.config.supported_frequency_range.min / 1000) + 10000,
				'stop_frequency':  (SA.config.supported_frequency_range.max / 1000) - 10000
			};
		}
		SA.setConfig(o);		
		// init GUI & listeners
		initConfigPanel();		
		setupConfigPanelListeners();

		// send scanner config to tx, w/ async reset of plot graph
		SA.sendConfig(function() {SA.resetNeedle();});
}
function initConfigPanel() {
	// translate to user-selected language
	localize();
	
	// setup input validation hooks
	validate_bounds('input[type="number"]');
	
	// populate inputs w/ config data
	$('#start-frequency').val(parseFloat(SA.config.start_frequency / 1000).toFixed(1));
	$('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));
	$('#average-samples').val(SA.config.average_samples);
	$('#step-size').val(SA.config.step_size);
	$('#plot-type').val(SA.config.graph_type);
	$('#plot-units').val(SA.config.graph_units);

	// if averaging was enabled, re-select the checkbox
	if (SA.config.overtime_averaging) 
		$('div#plot-configuration input[name="overtime-averaging"]').prop('checked', true);
	
	// only show hop channel button in TX mode
	if(GUI.module=='RX')
		$('.display_hopchannels').hide();
	else
		$('.display_hopchannels').show();
}
function setupConfigPanelListeners() {
	var gc = global_config.SA_config;
	// numeric inputs for freq's, samples, & step size
	$('div#analyzer-configuration input').change(function () {
		var start = parseFloat($('#start-frequency').val()).toFixed(1) * 1000, // convert from MHz to kHz
			stop = parseFloat($('#stop-frequency').val()).toFixed(1) * 1000, // convert from MHz to kHz
			average_samples = parseInt($('#average-samples').val()),
			step_size = parseInt($('#step-size').val()),
			resetNeedle = false;

		if (SA.config.average_samples != average_samples || SA.config.step_size != step_size) {
			resetNeedle = true;
		}

		// update analyzer config with latest settings
		var o = {
			'start_frequency':start,
			'stop_frequency':stop,
			'average_samples':average_samples,
			'step_size':step_size
		};
		SA.setConfig(o);
		$.extend(gc, o);
		
		if (!resetNeedle) {
			SA.sendConfig();
		} else {
			SA.sendConfig(function () {
				SA._dataArray = [];
				SA.resetNeedle();
			});
		}
	});
	
	// plot type selection box
	$('div#plot-configuration #plot-type').change(function () {
		SA.config.graph_type = String($('#plot-type').val());
	});
	
	// plot units, RSSI or dBm
	$('div#plot-configuration #plot-units').change(function () {
		SA.config.graph_units = String($('#plot-units').val());
		SA._setHeightScale();
		
		// reset all needed arrays/variables
		SA._dataArray = [];

		if (SA.config.reference) {
			$('.save_reference').click();
		}
	});
	
	// toggle overtime averaging
	$('div#plot-configuration input[name="overtime-averaging"]').change(function () {
		if ($(this).is(':checked')) {
			SA.config.overtime_averaging = true;
		} else {
			SA.config.overtime_averaging = false;
		}
		SA._dataArray = [];
	});
	
	// Pause/Resume handler
	$('.pause-resume').click(function () {
		var clicks = $(this).data('clicks');
		SA.pauseResume(!clicks);
		if (!clicks) {
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_resume')).addClass('resume');
		} else {
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_pause')).removeClass('resume');
		}
		$(this).data('clicks', !clicks);
	});
	
	// Reference handler
	$('.save_reference').click(function () {
		var clicks = $(this).data('clicks');
		if (!clicks) {
			SA._refDataArray = SA._deepCopy(SA._dataArray);
			SA.config.reference = true;
			SA.redraw();
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_disable_reference')).addClass('active');
		} else {
			SA._refDataArray = [];
			SA.config.reference = false;
			SA.redraw();
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_enable_reference')).removeClass('active');
		}
		$(this).data('clicks', !clicks);
	});
	
	// Hopchannel handler
	$('.display_hopchannels').click(function () {
		var toggle_on = !$(this).data('toggle_on');
		gc.enable_hops =  toggle_on;
		SA.toggleHops(toggle_on);

		if(toggle_on)
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_hide_hop_channels')).addClass('active');
		else
			$(this).text(chrome.i18n.getMessage('spectrum_analyzer_display_hop_channels')).removeClass('active');
		$(this).data('toggle_on', toggle_on);
	}).data('toggle_on',false);
	
	// trigger click to re-enable hops if necessary
	// placed here in order to make sure listener is ready before calling
	if(gc.enable_hops) {
		$('.display_hopchannels').trigger('click');
	}
}

var spectrum_analyzer = function () {
    this.config = {
        supported_frequency_range: {
            min:        null,
            max:        null,
            callback:   undefined
        },
        start_frequency:    null,
        stop_frequency:     null,
        average_samples:    80,
        step_size:          50,
        graph_type:         'area',
        graph_units:        'rssi',
        paused:              false,
        overtime_averaging: false,
        reference:          false,
        enable_hops:  false,
    };
	this._plot = {
		margin:{top: 20, right: 20, bottom: 10, left: 40},
		width:0,
		height:0,
		divID:'#plot',
		specID:'#saSVG',
		hopID:'#hopSVG',
		specCanvas:null,
		hopCanvas:null,
		widthScale:null,
		invWidthScale:null,
		heightScale:null
	};
	this._hopdown = false;
	this._currentHop = null;
	this._redrawHopChannels = false;
    this._needle_position;
    this._dataArray = [];	
    this._messageBuffer = [];
    this._hopChannels = [];	
	this._hopBars ={};
    this._refDataArray = [];
	this._zooming = false;
	this._init();
};
spectrum_analyzer.prototype._init = function() {
	var self = this;
	var cfg = self.config;
	var p = self._plot;
	
	p.specCanvas = d3.select(p.specID);
	p.hopCanvas = d3.select(p.hopID);

	// Define some default values
	cfg.paused = false;
	cfg.reference = false;
	self._redrawHopChannels = true;

	// initialize 'hop channels' array 
	// not really necessary? 
	self._hopChannels = [];

	// setup UI listeners / hooks
	// trigger resize to set height & width scale factors
	self._setupListeners();
	$(window).trigger('resize');

	// Start rendering timer
	// 40ms redraw = 25 fps
	GUI.interval_add('SA_redraw_plot', function () {self.redraw();}, 40, 1); 
};
spectrum_analyzer.prototype._setupListeners = function(e) {
	var self = this;
	var div = $(self._plot.divID);
	// first, kill the hop info label
	$("#freqinfo").hide();
	
	// adjust plot dimensions on resize
	$(window).resize(function(e) {
		var p = self._plot;
		var svg=$(p.specID);
		p.width = svg.width() - p.margin.left - p.margin.right;
		p.height = svg.height() - p.margin.top - p.margin.bottom;
		self._setWidthScale();
		self._setHeightScale();
	});

	// mousewheel zoom in/out
	// only handle one scroll at a time
	div.bind('wheel', function (e) {
		self._hopdown = false;
		if(self._zooming) {
			return;
		}
		self._zoom(e);
	});

	// panning & hop hilighting/dragging
	var x = 40,y = 50;
	div.bind('mousedown', function(e) {
		var target = $(e.target);
		if ( target.is( 'rect' ) ) {
			self._hopdown = true;
			var idx = target.attr('id');
			self._currentHop = self._hopBars[idx];
			self._currentHop.toggleHopLabel(true, e);
			$('#mouse_frequency').html('--');
		} else {
			self._hopdown = false;
			$(this).data('drag_initiated',e.originalEvent.layerX);
			$(this).css({'cursor':'-webkit-grabbing'});
		}
	});
	div.bind('mouseup', function(e) {
			self._hopdown = false;
			$(this).css({'cursor':'crosshair'});
			if(self._currentHop) {
				 self._currentHop.toggleHighlight(false);
				 self._currentHop.toggleHopLabel(false, e);
				 self._currentHop = null;
			}
	});
	div.bind('mousemove', function(e) {
		var txt;
		var f = self._getFreqFromPosition(e);
		if(self._hopdown) {
			var h = self._currentHop;

			// check if we're out of bounds
			// based on start freq, max freq, & channel count
			if(!h._hop._checkFrequency(f))
				return;

			// check if there's overlap of hop bars
			// don't allow a hop to be dragged on top of another
			var c = h._hop._freq2hop(f);			
			if(self.checkHopOverlap(c)) 
				return;

			// move & hilite hop bar
			// commit data to bind_data object			
			// toggle floating info label
			div.css({'cursor':'pointer'});
			h.toggleHighlight(true);
			h.moveToChan(c).commit();
			h.toggleHopLabel(true, e);
		} else {
			// update the crosshair freq info readout
			// drag plot if necessary
			txt=(f / 1000).toFixed(3)+' MHz';
			$('#mouse_frequency').html(txt);
			self._drag(e);
		}
	});
	div.bind('mouseout', function(e) {
		$('#mouse_frequency').html('--');
	});
};
spectrum_analyzer.prototype._setWidthScale = function() {
	var self = this;
	var cfg = self.config;
	self._plot.widthScale = d3.scale.linear()
		.domain([cfg.start_frequency, cfg.stop_frequency])
		.range([0, self._plot.width]);
	
	self._plot.invWidthScale = d3.scale.linear()
		.domain([0, self._plot.width])
		.range([cfg.start_frequency, cfg.stop_frequency]);
};
spectrum_analyzer.prototype._setHeightScale = function() {
	var self = this;
	var cfg = self.config;
	var ht = self._plot.height;
	var hs;
    if (cfg.graph_units == 'rssi') {
        hs = d3.scale.linear()
            .domain([0, 255])
            .range([ht, 0]);
    } else if (cfg.graph_units == 'dbm') {
        hs = d3.scale.linear()
            .domain([-123, 0])
            .range([ht, 0]);
    }
	self._plot.heightScale = hs;
};
spectrum_analyzer.prototype._peakDetection = function () {
    var highest_sample; // needs to match sample array length

    if (this.config.graph_units == 'rssi') {
        highest_sample = [0, 0, 0, 0];
    } else if (this.config.graph_units == 'dbm') {
        highest_sample = [0, 0, -128, 0];
    }

    for (var i = 0; i < this._dataArray.length; i++) {
        if (this._dataArray[i][2] > highest_sample[2]) highest_sample = this._dataArray[i];
    }
    $('.peak_detection .peak').html((highest_sample[0] / 1000).toFixed(2) + ' MHz @ ' + highest_sample[2]);
};
spectrum_analyzer.prototype._getFreqFromPosition = function(e) {
	var div=$(this._plot.divID);
	var o = div.offset();
	var m = this._plot.margin;
	
	var x = e.pageX - o.left-m.left; //subtract x-axis margin, from d3 data transform
	var w = this._plot.width;
	
	if(x < 0 || x > (w-m.right)) {return false;}
	return Math.round(this._plot.invWidthScale(x));
};
spectrum_analyzer.prototype._drag = function(e) {
	var cfg = this.config;
	var div=$(this._plot.divID);
	if (cfg.paused) {return;}

	// short circuit if !left button
	// or !mousewheel click button
	if (e.which != 1 && e.which != 2) {
		return;
	}
	
	var x_origin = div.data('drag_initiated');
	var x_pos = e.originalEvent.layerX;
	var x_dragged = (x_origin - x_pos);

	if (Math.abs(x_dragged) < 20) {
		return;
	}
	
	var limit_min = (cfg.supported_frequency_range.min / 1000000);
	var limit_max = (cfg.supported_frequency_range.max / 1000000);
	var current_range = (cfg.stop_frequency - cfg.start_frequency);
	var jump_factor = ((current_range / 10000) / 2);
	var start_previous = parseFloat($('#start-frequency').val());
	var end_previous = parseFloat($('#stop-frequency').val());

	// enforce minimum limit
	if (jump_factor < 0.1) {
		jump_factor = 0.1;	
	}

	var step = 20;
	if (x_dragged < 0) {
		jump_factor = -jump_factor;
		step = -step;
	}

	var start = parseFloat(((cfg.start_frequency / 1000) + jump_factor).toFixed(1));
	var stop = parseFloat(((cfg.stop_frequency / 1000) + jump_factor).toFixed(1));
	div.data('drag_initiated', x_origin - step);

	// check bounds
	if(step<0){
		if (start > limit_min) {
			$('#start-frequency').val(start);
			$('#stop-frequency').val(stop);
		} else {
			$('#start-frequency').val(limit_min.toFixed(1));
		}		
	}else{
		if (stop < limit_max) {
			$('#start-frequency').val(start);
			$('#stop-frequency').val(stop);
		} else {
			$('#stop-frequency').val(limit_max.toFixed(1));
		}	
	}

	// fire change event only when necessary
	if (start_previous != parseFloat($('#start-frequency').val()) || end_previous != parseFloat($('#stop-frequency').val())) {
		$('#start-frequency, #stop-frequency').change();
		// if needle is out of visible range, reset it
		if (this._needle_position < parseFloat($('#start-frequency').val()) * 1000 || this._needle_position > parseFloat($('#stop-frequency').val()) * 1000) {
			this.resetNeedle();
		}
	}
	this._redrawHopChannels = true;
};
spectrum_analyzer.prototype._zoom = function(e) {
	var cfg = this.config;
	if (cfg.paused) {return;}

	// set single-instance zoom flag
	this._zooming=true;
	
	this._redrawHopChannels = true;
	
	var div=$(this._plot.divID);
	var parentOffset = div.parent().offset();
	var relativeX = e.originalEvent.pageX - parentOffset.left;
	var delta = e.originalEvent.wheelDelta;
	
	var areaWidth = div.width();
	var current_range = cfg.stop_frequency - cfg.start_frequency;
	var jump_factor = (current_range / 10000);
	var jump_lean = relativeX / areaWidth;
	var jump_lean_down = (1.0 - jump_lean);
	
	var limit_min = cfg.supported_frequency_range.min / 1000000;
	var limit_max = cfg.supported_frequency_range.max / 1000000;
	
	var start_up = parseFloat(((cfg.start_frequency / 1000) + (jump_factor * jump_lean)).toFixed(1));
	var start_down = parseFloat(((cfg.start_frequency / 1000) - jump_factor).toFixed(1));
	var end_up = parseFloat(((cfg.stop_frequency / 1000) + jump_factor).toFixed(1));
	var end_down = parseFloat(((cfg.stop_frequency / 1000) - (jump_factor * jump_lean_down)).toFixed(1));
	var start_previous = parseFloat($('#start-frequency').val());
	var end_previous = parseFloat($('#stop-frequency').val());

	// move to custom event
	if (delta > 0) {
		// up (zoom in)
		$('#start-frequency').val((start_up < limit_max) ? start_up : limit_max.toFixed(1));
		$('#stop-frequency').val((end_down > limit_min) ? end_down : limit_min.toFixed(1));
	} else {
		// down (zoom out)
		$('#start-frequency').val((start_down > limit_min) ? start_down : limit_min.toFixed(1));
		$('#stop-frequency').val((end_up < limit_max) ? end_up : limit_max.toFixed(1));
	}

	// fire change event only when necessary
	// move to custom event
	if (start_previous != parseFloat($('#start-frequency').val()) || end_previous != parseFloat($('#stop-frequency').val())) {
		$('#start-frequency, #stop-frequency').change();

		// if needle is out of visible range, reset it
		if (this._needle_position < parseFloat($('#start-frequency').val()) * 1000 || this._needle_position > parseFloat($('#stop-frequency').val()) * 1000) {
			this.resetNeedle();
		}
	}
	// clear single-instance zoom flag
	this._zooming = false;
};
spectrum_analyzer.prototype._deepCopy = function(obj) {
    return $.extend(true, [], obj);
};
spectrum_analyzer.prototype.read = function(readInfo) {
    var data = new Uint8Array(readInfo.data);
    for (var i = 0; i < data.length; i++) {
		// new line character '\n'
        if (data[i] == 0x0A) { 
            // process message and start receiving a new one
            this.processMessage(this._messageBuffer);
            // empty buffer
            this._messageBuffer = [];
        } else {
            this._messageBuffer.push(data[i]);
        }
    }
};
spectrum_analyzer.prototype.processMessage = function(message_buffer) {
	var message_needle = 0;
	var message = {
		frequency: 0,
		RSSI_MAX:  0,
		RSSI_SUM:  0,
		RSSI_MIN:  0
	};

	if (message_buffer[0] == 0x44) { // extract frequency range from the message
		message_buffer.shift(); // remove 'D'
		this.config.supported_frequency_range.min = 0;
		this.config.supported_frequency_range.max = 0;

		for (var i = 0; i < message_buffer.length; i++) {
			if (message_buffer[i] == 0x2C) { // divider ,
				message_needle++;
			} else {
				message_buffer[i] -= 0x30;
					switch (message_needle) {
					case 0:
						this.config.supported_frequency_range.min = this.config.supported_frequency_range.min * 10 + message_buffer[i];
						break;
					case 1:
						this.config.supported_frequency_range.max = this.config.supported_frequency_range.max * 10 + message_buffer[i];
						break;
				}
			}
		}
		this.config.supported_frequency_range.callback();
		return;
	}

	for (var i = 0; i < message_buffer.length; i++) {
		if (message_buffer[i] == 0x2C) { // divider ,
			message_needle++;
		} else {
			message_buffer[i] -= 0x30;
			switch (message_needle) {
				case 0:
					message.frequency = message.frequency * 10 + message_buffer[i];
					break;
				case 1:
					message.RSSI_MAX = message.RSSI_MAX * 10 + message_buffer[i];
					break;
				case 2:
					message.RSSI_SUM = message.RSSI_SUM * 10 + message_buffer[i];
					break;
				case 3:
					message.RSSI_MIN = message.RSSI_MIN * 10 + message_buffer[i];
					break;
			}
		}
	}

	// run peak detection when needle reaches end of the visible array
	if (this._needle_position > message.frequency && this._needle_position != undefined) {
		this._peakDetection();		
	}

	this._needle_position = message.frequency;
	
	// short-circuit if paused
	if (this.config.paused){
		return;
	}
		
	// don't let array values go overboard
	if (message.frequency < this.config.start_frequency || message.frequency > this.config.stop_frequency) {
		return;
	}

	if (this.config.graph_units == 'dbm') {
		message.RSSI_MAX = message.RSSI_MAX * 0.5 - 123;
		message.RSSI_SUM = message.RSSI_SUM * 0.5 - 123;
		message.RSSI_MIN = message.RSSI_MIN * 0.5 - 123;
	}

	if (this.config.overtime_averaging == false) {
		for (var i = 0; i < this._dataArray.length; i++) {
			if (this._dataArray[i][0] == message.frequency) {
				// update values
				this._dataArray[i][1] = message.RSSI_MIN;
				this._dataArray[i][2] = message.RSSI_MAX;
				this._dataArray[i][3] = message.RSSI_SUM;
				return;
			}
		}
		// match wasn't found, push new data to the array
		this._dataArray.push([message.frequency, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM]);
	} else {
		for (var i = 0; i < this._dataArray.length; i++) {
			if (this._dataArray[i][0] == message.frequency) {
				// update values
				this._dataArray[i][4] += 1; // divider
				this._dataArray[i][5] += message.RSSI_SUM;
				if (this._dataArray[i][1] > message.RSSI_MIN) {
					this._dataArray[i][1] = message.RSSI_MIN;						
				}
				if (this._dataArray[i][2] < message.RSSI_MAX) {
					this._dataArray[i][2] = message.RSSI_MAX;						
				}
				this._dataArray[i][3] = this._dataArray[i][5] / this._dataArray[i][4];
				return;
			}
		}
		// match wasn't found, push new data to the array
		this._dataArray.push([message.frequency, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM, 1, message.RSSI_SUM]);
	}
};
spectrum_analyzer.prototype.pauseResume = function(pause) {
	if(pause) {
		this.config.paused = true;
		GUI.interval_remove('SA_redraw_plot');	
	}else{
		this.config.paused = false;
		var self = this;
		GUI.interval_add('SA_redraw_plot', function () {
			self.redraw();
		}, 40);
	}
};
spectrum_analyzer.prototype.getSupportedFrequencies = function(callback) {
    this.config.supported_frequency_range.callback = callback;
    sm.send("D");
};
spectrum_analyzer.prototype.sendConfig = function(callback) {
    var self = this;
    var ascii_out = '#' +
        self.config.start_frequency.toString() + ',' +
        self.config.stop_frequency.toString() + ',' +
        self.config.average_samples.toString() + ',' +
        self.config.step_size.toString() + ',';
		
	sm.send(ascii_out, function() {
		// disable reference
		if (self.config.reference) {
			$('.save_reference').click();
		}
		if (callback) callback();
	});
};
spectrum_analyzer.prototype.setConfig = function(o) {
	$.extend(this.config,o);
	this._setWidthScale();
	this._setHeightScale();
	this._redrawHopChannels = true;
}
spectrum_analyzer.prototype.resetNeedle = function() {
	sm.send('S');
};
spectrum_analyzer.prototype.redraw = function() {
	this.redrawPlot();
	this.redrawHops();
};
spectrum_analyzer.prototype.redrawPlot = function () {
	var self = this;
	var cfg = self.config;
	var dat = self._dataArray;
	var cv = self._plot.specCanvas;
	if (!dat.length) {
		return;	
	}
		
    // drop data outside visible range
    for (var i = (dat.length-1); i >= 0; i--) {
		if (dat[i][0] < cfg.start_frequency || dat[i][0] > cfg.stop_frequency) {
			dat.splice(i, 1);
		}
	}
    dat.sort(); // sort array members (in case of 'jumps')

	$(self._plot.specID).empty();
    var width = self._plot.width;
	var height = self._plot.height;
	var widthScale = self._plot.widthScale;
	var heightScale = self._plot.heightScale;

	var xAxis = d3.svg.axis()
		.scale(widthScale)
		.orient('bottom')
		.tickFormat(function(d) {return d / 1000;});

	var yAxis = d3.svg.axis()
		.scale(heightScale)
		.orient('left');

	var xGrid = d3.svg.axis()
		.scale(widthScale)
		.orient('bottom')
		.tickSize(-height, 0, 0)
		.tickFormat('');

	var yGrid = d3.svg.axis()
		.scale(heightScale)
		.orient('left')
		.tickSize(-width, 0, 0)
		.tickFormat('');

    // render xGrid
	cv.append('g').attr({'class':'grid x','transform': 'translate(40, 275)'}).call(xGrid);

	// render yGrid
	cv.append('g').attr({'class': 'grid y','transform': 'translate(40, 10)'}).call(yGrid);

	// render xAxis
	cv.append('g').attr({'class': 'axis x','transform': 'translate(40, 275)'}).call(xAxis);

	// render yAxis
	cv.append('g').attr({'class': 'axis y','transform':'translate(40, 10)'}).call(yAxis);

	// render data
	var data = cv.append('g').attr({'name':'data','transform':'translate(40, 9)'});

	if (cfg.graph_type == 'area') {
		var area_min, area_sum, area_max;
		if (cfg.graph_units == 'rssi') {
			area_min = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(0);})
				.y1(function(d) {return heightScale(d[1]);});

			area_sum = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(0);})
				.y1(function(d) {return heightScale(d[3]);});

			area_max = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(0);})
				.y1(function(d) {return heightScale(d[2]);});
        } else if (cfg.graph_units == 'dbm') {
			area_min = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(-123);})
				.y1(function(d) {return heightScale(d[1]);});

			area_sum = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(-123);})
				.y1(function(d) {return heightScale(d[3]);});

			area_max = d3.svg.area()
				.x(function(d) {return widthScale(d[0]);})
				.y0(function(d) {return heightScale(-123);})
				.y1(function(d) {return heightScale(d[2]);});
        }

		data.append('path')
			.style({'fill': '#f7464a'})
			.attr('d', area_max(dat));

		data.append('path')
			.style({'fill': '#949fb1'})
			.attr('d', area_sum(dat));

		data.append('path')
			.style({'fill': '#e2eae9'})
			.attr('d', area_min(dat));

		if (cfg.reference) {
			var area_reference;
			if (cfg.graph_units == 'rssi') {
				area_reference = d3.svg.area()
					.x(function(d) {return widthScale(d[0]);})
					.y0(function(d) {return heightScale(0);})
					.y1(function(d) {return heightScale(d[3]);});
			} else if (cfg.graph_units == 'dbm') {
				area_reference = d3.svg.area()
					.x(function(d) {return widthScale(d[0]);})
					.y0(function(d) {return heightScale(-123);})
					.y1(function(d) {return heightScale(d[3]);});
			}
			data.append('path')
				.style({'fill': '#ffb553', 'opacity': '0.75'})
				.attr('d', area_reference(self._refDataArray));
		}
	} else if (cfg.graph_type == 'lines') {
		var line_min = d3.svg.line()
			.x(function(d) {return widthScale(d[0]);})
			.y(function(d) {return heightScale(d[1]);});

		var line_sum = d3.svg.line()
			.x(function(d) {return widthScale(d[0]);})
			.y(function(d) {return heightScale(d[3]);});

		var line_max = d3.svg.line()
			.x(function(d) {return widthScale(d[0]);})
			.y(function(d) {return heightScale(d[2]);});

		data.append('path')
			.style({'stroke-width': '2px', 'stroke': '#f7464a', 'fill': 'none'})
			.attr('d', line_max(dat));

		data.append('path')
			.style({'stroke-width': '2px', 'stroke': '#949fb1', 'fill': 'none'})
			.attr('d', line_sum(dat));

		data.append('path')
			.style({'stroke-width': '2px', 'stroke': '#e2eae9', 'fill': 'none'})
			.attr('d', line_min(dat));

		if (cfg.reference) {
			var line_reference = d3.svg.line()
				.x(function(d) {return widthScale(d[0]);})
				.y(function(d) {return heightScale(d[3]);});

			data.append('path')
				.style({'stroke-width': '2px', 'stroke': '#ffb553', 'fill': 'none', 'opacity': '0.75'})
				.attr('d', line_reference(self._refDataArray));
		}
	}

	if (cfg.overtime_averaging) {
		try {
			$('span.overtime-averaging-counter').text(dat[0][4]);
		} catch (e) {}
	} else {
		$('span.overtime-averaging-counter').text(0);
	}
};
spectrum_analyzer.prototype.redrawHops = function () {
	var self = this;
	if (!self._redrawHopChannels) {return;}
	self._redrawHopChannels = false;

	// empty out the hop bars
	// destroy the hop info label
	$(self._plot.hopID).empty();
	$('#freqinfo').hide();
	
	if(!self.config.enable_hops) {return;}

	if(self._currentHop) {
		self._currentHop.toggleHopLabel(false);		
	}
	
	var height = this._plot.height;
	var cv = this._plot.hopCanvas;	
	var hops = this._hopChannels.getHops();
	var hopData = cv.append('g').attr({'name': 'data','transform':'translate(41, 10)'});

	var self = this;
	var cfg = self.config;
	for(var i = 0; i < hops.length; i++) {
		var v = hops[i];
		if (v.frequency_start >= cfg.start_frequency
			&& v.frequency_start <= cfg.stop_frequency
			&& v.frequency_end >= cfg.start_frequency
			&& v.frequency_end <= cfg.stop_frequency) 
		{
			var p = {'spec':self,'hop':v,'dset':hopData};
			var r = new hop_bar(p);
			self._hopBars[v._index] = r;
		}
	}
} 
spectrum_analyzer.prototype.toggleHops = function(show) {
	if (show) {
		this.config.enable_hops = true;
	} else {
		this.config.enable_hops = false;
	}
	this._redrawHopChannels = true;
};
spectrum_analyzer.prototype.checkHopOverlap = function(c) {
	var h = this._currentHop;
	var idx = h._hop._index;
	var ha = this._hopChannels.getHops();

	for(var i=0; i<ha.length; i++){
			if(ha[i]._index == idx)	{
				continue;				
			}
			if(c == ha[i]._channel){
				return true;
			}
	}
	return false;
};
spectrum_analyzer.prototype.setHops = function(hopsCollection) {
	this._hopChannels = hopsCollection;
	return this;
};

var hop_bar = function (params) {
	this._spec = params.spec;
	this._height = params.spec._plot.height;
	this._dset = params.dset;
	this._hop = params.hop;
	this._index = this._hop._index;
	this._default_style={'fill': '#13b6b3', 'opacity': '0.50'};
	this._rect = this._dset.append('rect');
	this._rect.style(this._default_style);
	this._rect.attr({'id': this._index, 'height': this._height});
	this.resetPosition();
	this._setupListeners();
};
hop_bar.prototype._setupListeners = function() {
	var self = this;
	var h=$('rect#'+self._index);
	
	// we ignore hop bar mouse events 
	// if spec_a already registers mousedown on a hop bar
	// this prevents unwanted hilighting on other bars
	h.on('mouseover',function(e) {
		if(self._spec._hopdown)
			return;
		self.toggleHighlight(true);
		self.toggleHopLabel(true, e);
	});
	h.on('mouseout',function(e) {
		if(self._spec._hopdown)
			return;
		self.toggleHighlight(false);
		self.toggleHopLabel(false, e);
	});
};
hop_bar.prototype._getHopWidthScale = function(hop) {
	var p = this._spec._plot.widthScale;
	return p(hop.frequency_end) - p(hop.frequency_start);
};
hop_bar.prototype.resetPosition = function() {
	this._xpos = this._spec._plot.widthScale(this._hop.frequency_start);	
	this._width = this._getHopWidthScale(this._hop); 
	this._rect.attr({'x':this._xpos, 'width':this._width});
	return this;
};
hop_bar.prototype.toggleHighlight = function(toggle_on) {
	var self = this;
	if(toggle_on) {
		self._rect.style({'cursor':'pointer','fill': '#ff2828'});
	}else{
		self._rect.style({'fill': '#13b6b3'});
	}
	return this;
};
hop_bar.prototype.toggleHopLabel = function(show, e){
	var self=this;
	if(show){
			// simple pad func, move somewhere else?
			function z3pad(n){return (n<100)?("0"+((n<10)?"0"+n:n)):n;} 
			
			var x = 40, y = 60;
			var o={left:e.pageX-x,top:e.pageY-y};

			var h = this._hop;
			var c = h._channel;
			var i = h._index+1; // hop# isn't zero-indexed
			var f = ((h.frequency_center/1000).toFixed(3));

			var html = "<span class='freq_label'>Hop #:</span>"+ z3pad(i) +
							"<br><span class='freq_label'>&nbsp;CH #:</span>"+ z3pad(c) + 
							"<br>" + f +' MHz';

			$('#freqinfo').html(html).show().offset(o);
	}else{
		$('#freqinfo').hide();
		clearTimeout(this._timeout);
	}
};
hop_bar.prototype.commit = function() {
	this._hop.commitData();
	return this;
};
hop_bar.prototype.moveToChan = function(c) {
	this._hop.updateData(c);
	this.resetPosition();
	return this;
};

var hop_channel = function(o) {
	this._index = o.index;
	this._channel = o.channel;
	this._channel_width = null;
	this.frequency_center = null;
	this.frequency_start = null;
	this.frequency_end = null;
	this.updateData(this._channel);
	return this;
};
hop_channel.prototype._checkFrequency = function(freq) {
	var f = freq * 1000;
	if(f <= BIND_DATA.rf_frequency || f > TX_CONFIG.max_frequency)
		return false;
	return freq;
};
hop_channel.prototype._getChannelWidth = function() {
	var channelWidth = 250;
	if (BIND_DATA.modem_params < 4) {
		// 4800 - 57600
		channelWidth = 60; // kHz
	}
	return channelWidth;
};
hop_channel.prototype._freq2hop = function(f) {
	var chsp = BIND_DATA.rf_channel_spacing * 10000; // 50-250 kHz
	var fh =  f * 1000; // KHz * 1000 = Hz
	var raw_hop = 1;
	
	// short circuit to hop #1
	if(fh <= BIND_DATA.rf_frequency  ) {
		return raw_hop; 
	}
	
	// set freq to max allowable	
	if(fh > TX_CONFIG.max_frequency) {
		fh = TX_CONFIG.max_frequency 	
	}
	// remove offset to make rounding work
	// round to nearest multiple of channel spacing
	fh = (fh - BIND_DATA.rf_frequency);	
	fh = (Math.round(fh / chsp) * chsp) +  BIND_DATA.rf_frequency;	
	
	// make sure we don't go over max by one hop due to rounding
	if(fh > TX_CONFIG.max_frequency) {
		fh -= chsp;
	}
	
	// convert to hop channel index
	raw_hop = (fh - BIND_DATA.rf_frequency) / chsp; 

	// check hop index bounds
	if(raw_hop > 255) {
		raw_hop = 255;		
	}
	if(raw_hop < 1) {
		raw_hop = 1;	
	}
	
	return raw_hop;
};
hop_channel.prototype._hop2freq = function(h) {
	var freq = (BIND_DATA.rf_frequency + this._channel *  BIND_DATA.rf_channel_spacing * 10000) / 1000; // kHz
	return freq;
};
hop_channel.prototype.updateData = function(ch) {
	// simple sanity check, 
	// should not normally return false
	if(ch < 1 || ch > 255) { 
		return false;
	}
	this._channel = ch;
	var freq = this._hop2freq(ch);
	this.frequency_center = freq;
	
	// update this dynamically just in case
	// might not be necessary though
	this._channel_width = this._getChannelWidth(); 
	this.frequency_start = freq - (this._channel_width / 2);
	this.frequency_end = freq + (this._channel_width / 2);
	return this;
};
hop_channel.prototype.commitData = function() {
	BIND_DATA.hopchannel[this._index] = this._channel;
	return this;
};

var hop_collection = function(d) {
	this._data = d;
	this._hops=[];
	var self = this;
	for(var i=0; i < self._data.hopchannel.length; i++) {
		// only process valid channels
		var v = self._data.hopchannel[i];
		if (v != 0) {
			self._hops.push(new hop_channel({'index':i,'channel':v}));
		}
	}
};
hop_collection.prototype.getHops = function(i) {
	if(i)
		return this._hops[i];
	else
		return this._hops;
};

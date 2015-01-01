'use strict';

function tab_initialize_spectrum_analyzer() {
    $('#content').load("./tabs/spectrum_analyzer.html", function () {
        if (GUI.active_tab != 'spectrum_analyzer') {
            GUI.active_tab = 'spectrum_analyzer';
            googleAnalytics.sendAppView('Spectrum Analyzer');
        }

        // translate to user-selected language
        localize();

        validate_bounds('input[type="number"]');

        if (GUI.module != 'RX') {
            // requesting to join spectrum analyzer
            console.log('Requesting to join scanner mode');

            PSP.send_message(PSP.PSP_REQ_SCANNER_MODE, false, false, function () {
                GUI.operating_mode = 3; // switching operating mode to spectrum analyzer, this will swich receiving reading timer to analyzer read "protocol"

                SA.get_supported_frequencies(function () {
                    if (!SA.config.start_frequency) {
                        SA.config.start_frequency = (SA.config.supported_frequency_range.min / 1000) + 10000;
                        SA.config.stop_frequency =  (SA.config.supported_frequency_range.max / 1000) - 10000;
                    }

                    $('#start-frequency').val(parseFloat(SA.config.start_frequency / 1000).toFixed(1));
                    $('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));

                    // manually fire change event so variables get populated & send_config is triggered
                    SA.send_config(function() {
                        SA.reset_needle();
                    });
                });
            });

            // show "display hop channels button" as it could have been disabled by previously using RX
            // in case user is using "TX" while entering SA multiple times, this code does "nothing"
            $('.display_hopchannels').show();
        } else {
            // manually fire change event so variables get populated & send_config is triggered
            // using small delay to make this call asynchronous, because .change event wasn't defined (yet)
            SA.get_supported_frequencies(function () {
                if (!SA.config.start_frequency) {
                    SA.config.start_frequency = (SA.config.supported_frequency_range.min / 1000) + 10000;
                    SA.config.stop_frequency =  (SA.config.supported_frequency_range.max / 1000) - 10000;
                }

                $('#start-frequency').val(parseFloat(SA.config.start_frequency / 1000).toFixed(1));
                $('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));

                SA.send_config(function() {
                    SA.reset_needle();
                });
            });

            // hide "display hop channels button" as there is no point of having it while using RX
            $('.display_hopchannels').hide();
        }

        // Define some default values
        SA.config.pause = false;
        SA.config.reference = false;
        SA.config.utilized_channels = false;

        $('#average-samples').val(SA.config.average_samples);
        $('#step-size').val(SA.config.step_size);

        $('#plot-type').val(SA.config.graph_type);
        $('#plot-units').val(SA.config.graph_units);

        // if averaging was enabled, re-select the checkbox
        if (SA.config.overtime_averaging) $("div#plot-configuration input[name='overtime-averaging']").prop('checked', true);

        // Start rendering timer
        GUI.interval_add('SA_redraw_plot', function () {
            SA.redraw();
        }, 40, 1); // 40ms redraw = 25 fps

        // Generate "utilized channels" array that will be available as overlay, maximum should be 24
        SA.utilized_channels = [];

        if (GUI.module != 'RX') {
            for (var i = 0; i < BIND_DATA.hopchannel.length; i++) {
                if (BIND_DATA.hopchannel[i] != 0) { // only process valid channels
                    var output = (BIND_DATA.rf_frequency + BIND_DATA.hopchannel[i] * BIND_DATA.rf_channel_spacing * 10000) / 1000; // kHz

                    var channel_width;
                    if (BIND_DATA.modem_params < 4) {
                        // 4800 - 57600
                        channel_width = 60; // kHz
                    } else {
                        // 125k
                        channel_width = 250; // kHz
                    }

                    SA.utilized_channels.push({'frequency_start': output - (channel_width / 2), 'frequency_end': output + (channel_width / 2)});
                }
            }
        }

        // UI hooks
        // mouse zoom in/out
        $('div#plot').bind('wheel', function (e) {
            if (!SA.config.pause) {
                var parentOffset = $(this).parent().offset(),
                    relativeX = e.originalEvent.pageX - parentOffset.left,
                    delta = e.originalEvent.wheelDelta,
                    areaWidth = $(this).width(),
                    current_range = SA.config.stop_frequency - SA.config.start_frequency,
                    jump_factor = (current_range / 10000),
                    jump_lean = relativeX / areaWidth,
                    jump_lean_down = (1.0 - jump_lean),
                    limit_min = SA.config.supported_frequency_range.min / 1000000,
                    limit_max = SA.config.supported_frequency_range.max / 1000000,
                    start_up = parseFloat(((SA.config.start_frequency / 1000) + (jump_factor * jump_lean)).toFixed(1)),
                    start_down = parseFloat(((SA.config.start_frequency / 1000) - jump_factor).toFixed(1)),
                    end_up = parseFloat(((SA.config.stop_frequency / 1000) + jump_factor).toFixed(1)),
                    end_down = parseFloat(((SA.config.stop_frequency / 1000) - (jump_factor * jump_lean_down)).toFixed(1)),
                    start_previous = parseFloat($('#start-frequency').val()),
                    end_previous = parseFloat($('#stop-frequency').val());

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
                if (start_previous != parseFloat($('#start-frequency').val()) || end_previous != parseFloat($('#stop-frequency').val())) {
                    $('#start-frequency, #stop-frequency').change();

                    // if needle is out of visible range, reset it
                    if (SA.needle_position < parseFloat($('#start-frequency').val()) * 1000 || SA.needle_position > parseFloat($('#stop-frequency').val()) * 1000) {
                        SA.reset_needle();
                    }
                }
            }
        });

        // panning
        $('div#plot').mousedown(function (e) {
            $(this).data('drag_initiated', e.originalEvent.layerX);
        });

        $('div#plot').mousemove(function (e) {
            if (!SA.config.pause) {
                if (e.which == 1) {
                    // dragging
                    var x_origin = $(this).data('drag_initiated'),
                        x_pos = e.originalEvent.layerX, // good enough for our purposes
                        x_dragged = x_origin - x_pos;

                    if (x_dragged <= -20 || x_dragged >= 20) {
                        var limit_min = SA.config.supported_frequency_range.min / 1000000,
                            limit_max = SA.config.supported_frequency_range.max / 1000000,
                            current_range = SA.config.stop_frequency - SA.config.start_frequency,
                            jump_factor = (current_range / 10000) / 2,
                            start_previous = parseFloat($('#start-frequency').val()),
                            end_previous = parseFloat($('#stop-frequency').val());

                        // enforce minimum limit
                        if (jump_factor < 0.1) jump_factor = 0.1;

                        if (x_dragged <= -20) {
                            // dragged right
                            var start = parseFloat(((SA.config.start_frequency / 1000) - jump_factor).toFixed(1)),
                                stop = parseFloat(((SA.config.stop_frequency / 1000) - jump_factor).toFixed(1));

                            $(this).data('drag_initiated', x_origin + 20);

                            // safeguards
                            if (start > limit_min) {
                                $('#start-frequency').val(start);
                                $('#stop-frequency').val(stop);
                            } else {
                                $('#start-frequency').val(limit_min.toFixed(1));
                            }
                        } else if (x_dragged >= 20) {
                            // dragged left
                            var start = parseFloat(((SA.config.start_frequency / 1000) + jump_factor).toFixed(1)),
                                stop = parseFloat(((SA.config.stop_frequency / 1000) + jump_factor).toFixed(1));

                            $(this).data('drag_initiated', x_origin - 20);

                            // safeguards
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
                            if (SA.needle_position < parseFloat($('#start-frequency').val()) * 1000 || SA.needle_position > parseFloat($('#stop-frequency').val()) * 1000) {
                                SA.reset_needle();
                            }
                        }
                    }
                }
            }
        });

        $('div#analyzer-configuration input').change(function () {
            var start = parseFloat($('#start-frequency').val()).toFixed(1) * 1000, // convert from MHz to kHz
                stop = parseFloat($('#stop-frequency').val()).toFixed(1) * 1000, // convert from MHz to kHz
                average_samples = parseInt($('#average-samples').val()),
                step_size = parseInt($('#step-size').val()),
                reset_needle = false;

            if (SA.config.average_samples != average_samples || SA.config.step_size != step_size) {
                reset_needle = true;
            }

            // update analyzer config with latest settings
            SA.config.start_frequency = start;
            SA.config.stop_frequency = stop;
            SA.config.average_samples = average_samples;
            SA.config.step_size = step_size;

            if (!reset_needle) {
                SA.send_config();
            } else {
                SA.send_config(function () {
                    SA.dataArray = [];
                    SA.reset_needle();
                });
            }
        });

        $('div#plot-configuration #plot-type').change(function () {
            SA.config.graph_type = String($('#plot-type').val());
        });

        $('div#plot-configuration #plot-units').change(function () {
            SA.config.graph_units = String($('#plot-units').val());

            // reset all needed arrays/variables
            SA.dataArray = [];

            if (SA.config.reference) {
                $('.save_reference').click();
            }
        });

        $("div#plot-configuration input[name='overtime-averaging']").change(function () {
            if ($(this).is(':checked')) {
                SA.config.overtime_averaging = true;
            } else {
                SA.config.overtime_averaging = false;
            }

            SA.dataArray = [];
        });

        // Pause/Resume handler
        $('.pause-resume').click(function () {
            var clicks = $(this).data('clicks');

            if (!clicks) {
                SA.config.pause = true;
                GUI.interval_remove('SA_redraw_plot');

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_resume')).addClass('resume');
            } else {
                SA.config.pause = false;

                GUI.interval_add('SA_redraw_plot', function () {
                    SA.redraw();
                }, 40);

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_pause')).removeClass('resume');
            }

            $(this).data("clicks", !clicks);
        });

        // Reference handler
        $('.save_reference').click(function () {
            var clicks = $(this).data('clicks');

            if (!clicks) {
                SA.reference_dataArray = SA.deep_copy(SA.dataArray);
                SA.config.reference = true;
                SA.redraw();

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_disable_reference')).addClass('active');
            } else {
                SA.reference_dataArray = [];
                SA.config.reference = false;
                SA.redraw();

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_enable_reference')).removeClass('active');
            }

            $(this).data("clicks", !clicks);
        });

        // Hopchannel handler
        $('.display_hopchannels').click(function () {
            var clicks = $(this).data('clicks');

            if (!clicks) {
                SA.config.utilized_channels = true;
                SA.redraw();

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_hide_hop_channels')).addClass('active');
            } else {
                SA.config.utilized_channels = false;
                SA.redraw();

                $(this).text(chrome.i18n.getMessage('spectrum_analyzer_display_hop_channels')).removeClass('active');
            }

            $(this).data("clicks", !clicks);
        });
    });
}

// var index = (message.frequency - config.start_frequency) / config.step_size;
// dbm = rssi * 0.5 - 123

var spectrum_analyzer = function () {
    this.config = {
        supported_frequency_range: {
            min:        null,
            max:        null,
            callback:   undefined
        },

        start_frequency:    null,
        stop_frequency:     null,
        average_samples:    500,
        step_size:          50,
        graph_type:         'area',
        graph_units:        'rssi',
        pause:              false,
        overtime_averaging: false,
        reference:          false,
        utilized_channels:  false
    };

    this.messageBuffer = [];

    this.needle_position;
    this.dataArray = [];
    this.reference_dataArray = [];

    this.utilized_channels = [];
};

spectrum_analyzer.prototype.read = function (readInfo) {
    var data = new Uint8Array(readInfo.data);

    for (var i = 0; i < data.length; i++) {
        if (data[i] == 0x0A) { // new line character \n
            // process message and start receiving a new one
            this.process_message(this.messageBuffer);

            // empty buffer
            this.messageBuffer = [];
        } else {
            this.messageBuffer.push(data[i]);
        }
    }
};

spectrum_analyzer.prototype.process_message = function (message_buffer) {
    var message_needle = 0;

    var message = {
        frequency: 0,
        RSSI_MAX:  0,
        RSSI_SUM:  0,
        RSSI_MIN:  0
    };

    if (message_buffer[0] == 0x44) { // extract frequency range from the message
        message_buffer.shift(); // remove "D"
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
    if (this.needle_position > message.frequency && this.needle_position != undefined) this.peak_detection();

    this.needle_position = message.frequency;

    if (!this.config.pause) {
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
            for (var i = 0; i < this.dataArray.length; i++) {
                if (this.dataArray[i][0] == message.frequency) {
                    // update values
                    this.dataArray[i][1] = message.RSSI_MIN;
                    this.dataArray[i][2] = message.RSSI_MAX;
                    this.dataArray[i][3] = message.RSSI_SUM;

                    return;
                }
            }

            // match wasn't found, push new data to the array
            this.dataArray.push([message.frequency, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM]);
        } else {
            for (var i = 0; i < this.dataArray.length; i++) {
                if (this.dataArray[i][0] == message.frequency) {
                    // update values
                    this.dataArray[i][4] += 1; // divider
                    this.dataArray[i][5] += message.RSSI_SUM;

                    if (this.dataArray[i][1] > message.RSSI_MIN) this.dataArray[i][1] = message.RSSI_MIN;

                    if (this.dataArray[i][2] < message.RSSI_MAX) this.dataArray[i][2] = message.RSSI_MAX;

                    this.dataArray[i][3] = this.dataArray[i][5] / this.dataArray[i][4];

                    return;
                }
            }

            // match wasn't found, push new data to the array
            this.dataArray.push([message.frequency, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM, 1, message.RSSI_SUM]);
        }
    }
};

spectrum_analyzer.prototype.get_supported_frequencies = function (callback) {
    this.config.supported_frequency_range.callback = callback;

    send("D");
};

spectrum_analyzer.prototype.send_config = function (callback) {
    var self = this;

    var ascii_out = "#" +
        this.config.start_frequency.toString() + "," +
        this.config.stop_frequency.toString() + "," +
        this.config.average_samples.toString() + "," +
        this.config.step_size.toString() + ",";

    send(ascii_out, function() {
        // disable reference
        if (self.config.reference) {
            $('.save_reference').click();
        }

        if (callback) callback();
    });
};

spectrum_analyzer.prototype.reset_needle = function () {
    send("S");
};

spectrum_analyzer.prototype.redraw = function () {
    var self = this;

    // drop data outside visible range
    for (var i = self.dataArray.length; i >= 0; i--) {
        if (self.dataArray[i] !== undefined) {
            if (self.dataArray[i][0] < self.config.start_frequency || self.dataArray[i][0] > self.config.stop_frequency) self.dataArray.splice(i, 1);
        }
    }

    self.dataArray.sort(); // sort array members (in case of "jumps")

    var tartget_e = $('svg');
    tartget_e.empty();

    var margin = {top: 20, right: 20, bottom: 10, left: 40},
        width = tartget_e.width() - margin.left - margin.right,
        height = tartget_e.height() - margin.top - margin.bottom,
        canvas = d3.select("svg");

    var widthScale = d3.scale.linear()
        .domain([self.config.start_frequency, self.config.stop_frequency])
        .range([0, width]);

    var heightScale;
    if (self.config.graph_units == 'rssi') {
        heightScale = d3.scale.linear()
            .domain([0, 255])
            .range([height, 0]);
    } else if (self.config.graph_units == 'dbm') {
        heightScale = d3.scale.linear()
            .domain([-123, 0])
            .range([height, 0]);
    }

    var hopchannelWidth = function(obj) {
        return widthScale(obj.frequency_end) - widthScale(obj.frequency_start);
    };

    var xAxis = d3.svg.axis()
        .scale(widthScale)
        .orient("bottom")
        .tickFormat(function(d) {return d / 1000;});

    var yAxis = d3.svg.axis()
        .scale(heightScale)
        .orient("left");

    var xGrid = d3.svg.axis()
        .scale(widthScale)
        .orient("bottom")
        .tickSize(-height, 0, 0)
        .tickFormat("");

    var yGrid = d3.svg.axis()
        .scale(heightScale)
        .orient("left")
        .tickSize(-width, 0, 0)
        .tickFormat("");

    // render xGrid
    canvas.append("g")
        .attr("class", "grid x")
        .attr("transform", "translate(40, 275)")
        .call(xGrid);

    // render yGrid
    canvas.append("g")
        .attr("class", "grid y")
        .attr("transform", "translate(40, 10)")
        .call(yGrid);

    // render xAxis
    canvas.append("g")
        .attr("class", "axis x")
        .attr("transform", "translate(40, 275)")
        .call(xAxis);

    // render yAxis
    canvas.append("g")
        .attr("class", "axis y")
        .attr("transform", "translate(40, 10)")
        .call(yAxis);

    // render data
    var data = canvas.append("g").attr("name", "data")
        .attr("transform", "translate(41, 10)");

    if (self.config.graph_type == 'area') {
        var area_min, area_sum, area_max;

        if (self.config.graph_units == 'rssi') {
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
        } else if (self.config.graph_units == 'dbm') {
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

        data.append("path")
            .style({'fill': '#f7464a'})
            .attr("d", area_max(self.dataArray));

        data.append("path")
            .style({'fill': '#949fb1'})
            .attr("d", area_sum(self.dataArray));

        data.append("path")
            .style({'fill': '#e2eae9'})
            .attr("d", area_min(self.dataArray));

        if (SA.config.reference) {
            var area_reference;
            if (self.config.graph_units == 'rssi') {
                area_reference = d3.svg.area()
                    .x(function(d) {return widthScale(d[0]);})
                    .y0(function(d) {return heightScale(0);})
                    .y1(function(d) {return heightScale(d[3]);});
            } else if (self.config.graph_units == 'dbm') {
                area_reference = d3.svg.area()
                    .x(function(d) {return widthScale(d[0]);})
                    .y0(function(d) {return heightScale(-123);})
                    .y1(function(d) {return heightScale(d[3]);});
            }

            data.append("path")
                .style({'fill': '#ffb553', 'opacity': '0.75'})
                .attr("d", area_reference(self.reference_dataArray));
        }
    } else if (self.config.graph_type == 'lines') {
        var line_min = d3.svg.line()
            .x(function(d) {return widthScale(d[0]);})
            .y(function(d) {return heightScale(d[1]);});

        var line_sum = d3.svg.line()
            .x(function(d) {return widthScale(d[0]);})
            .y(function(d) {return heightScale(d[3]);});

        var line_max = d3.svg.line()
            .x(function(d) {return widthScale(d[0]);})
            .y(function(d) {return heightScale(d[2]);});


        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#f7464a', 'fill': 'none'})
            .attr("d", line_max(self.dataArray));

        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#949fb1', 'fill': 'none'})
            .attr("d", line_sum(self.dataArray));

        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#e2eae9', 'fill': 'none'})
            .attr("d", line_min(self.dataArray));

        if (SA.config.reference) {
            var line_reference = d3.svg.line()
                .x(function(d) {return widthScale(d[0]);})
                .y(function(d) {return heightScale(d[3]);});

            data.append("path")
                .style({'stroke-width': '2px', 'stroke': '#ffb553', 'fill': 'none', 'opacity': '0.75'})
                .attr("d", line_reference(self.reference_dataArray));
        }
    }

    if (self.config.utilized_channels) {
        for (var i = 0; i < self.utilized_channels.length; i++) {
            if (self.utilized_channels[i].frequency_start >= self.config.start_frequency
            && self.utilized_channels[i].frequency_start <= self.config.stop_frequency
            && self.utilized_channels[i].frequency_end >= self.config.start_frequency
            && self.utilized_channels[i].frequency_end <= self.config.stop_frequency) {
                data.append("rect")
                    .style({'fill': '#13b6b3', 'opacity': '0.50'})
                    .attr("width", hopchannelWidth(self.utilized_channels[i]))
                    .attr("height", height)
                    .attr("x", widthScale(self.utilized_channels[i].frequency_start));
            }
        }
    }

    if (self.config.overtime_averaging) {
        try {
            $('span.overtime-averaging-counter').text(self.dataArray[0][4]);
        } catch (e) {

        }
    } else {
        $('span.overtime-averaging-counter').text(0);
    }
};

spectrum_analyzer.prototype.peak_detection = function () {
    var highest_sample; // needs to match sample array length

    if (this.config.graph_units == 'rssi') {
        highest_sample = [0, 0, 0, 0];
    } else if (this.config.graph_units == 'dbm') {
        highest_sample = [0, 0, -128, 0];
    }

    for (var i = 0; i < this.dataArray.length; i++) {
        if (this.dataArray[i][2] > highest_sample[2]) highest_sample = this.dataArray[i];
    }

    $('.peak_detection .peak').html((highest_sample[0] / 1000).toFixed(2) + ' MHz @ ' + highest_sample[2]);
};

spectrum_analyzer.prototype.deep_copy = function (obj) {
    return $.extend(true, [], obj);
};

var SA = new spectrum_analyzer();

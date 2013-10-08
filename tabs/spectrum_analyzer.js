// var index = (message.frequency - config.start_frequency) / config.step_size;
// dbm = rssi * 0.5 - 123
    
var spectrum_analyzer = function() {
    this.config = {
        start_frequency:    428000,
        stop_frequency:     438000,
        average_samples:    500,
        step_size:          50,
        graph_type:         'area',
        graph_units:        'rssi',
        pause:              false,
        overtime_averaging: false,
        reference:          false,
        utilized_channels:  false
    };
    
    this.dataArray = [];
    this.reference_dataArray = [];
    
    this.utilized_channels = [];
};

spectrum_analyzer.prototype.process_message = function(message_buffer) {
    var message_needle = 0;
    
    var message = {
        frequency: 0,
        RSSI_MAX:  0,
        RSSI_SUM:  0,
        RSSI_MIN:  0
    };

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
                    this.dataArray[i][5] += message.RSSI_MIN;
                    this.dataArray[i][6] += message.RSSI_MAX;
                    this.dataArray[i][7] += message.RSSI_SUM;
                    
                    this.dataArray[i][1] = this.dataArray[i][5] / this.dataArray[i][4];
                    this.dataArray[i][2] = this.dataArray[i][6] / this.dataArray[i][4];
                    this.dataArray[i][3] = this.dataArray[i][7] / this.dataArray[i][4];
                    
                    return;
                }
            }
            
            // match wasn't found, push new data to the array
            this.dataArray.push([message.frequency, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM, 1, message.RSSI_MIN, message.RSSI_MAX, message.RSSI_SUM]);
        }
    }
};

spectrum_analyzer.prototype.send_config = function() {
    var self = this;
    
    var ascii_out = "#" + 
        this.config.start_frequency.toString() + "," + 
        this.config.stop_frequency.toString() + "," + 
        this.config.average_samples.toString() + "," + 
        this.config.step_size.toString() + ",";
        
    send(ascii_out, function() {
        // drop current data
        self.dataArray = [];
        
        // disable reference
        if (self.config.reference) {
            $('.save_reference').click();
        }
    });
};

spectrum_analyzer.prototype.redraw = function() {
    var self = this;
    
    self.dataArray.sort(); // sort array members (in case of "jumps")
    
    $('svg').empty();
    
    var margin = {top: 20, right: 20, bottom: 10, left: 40};
    var width = 910 - margin.left - margin.right;
    var height = 270 - margin.top - margin.bottom;
    var canvas = d3.select("svg");
    
    var widthScale = d3.scale.linear()
        .domain([self.config.start_frequency, self.config.stop_frequency])
        .range([0, width]);
    
    if (self.config.graph_units == 'rssi') {
        var heightScale = d3.scale.linear()
            .domain([0, 255])
            .range([height, 0]);
    } else if (self.config.graph_units == 'dbm') {
        var heightScale = d3.scale.linear()
            .domain([-123, 0])
            .range([height, 0]);
    }

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
        .attr("transform", "translate(40, 250)")
        .call(xGrid);    
        
    // render yGrid
    canvas.append("g")
        .attr("class", "grid y")
        .attr("transform", "translate(40, 10)")
        .call(yGrid);

    // render xAxis
    canvas.append("g")
        .attr("class", "axis x")
        .attr("transform", "translate(40, 250)")
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
        if (self.config.graph_units == 'rssi') {
            var area_min = d3.svg.area()
                .x(function(d) {return widthScale(d[0]);})
                .y0(function(d) {return heightScale(0);})
                .y1(function(d) {return heightScale(d[1]);});
                
            var area_sum = d3.svg.area()
                .x(function(d) {return widthScale(d[0]);})
                .y0(function(d) {return heightScale(0);})
                .y1(function(d) {return heightScale(d[3]);});
                
            var area_max = d3.svg.area()
                .x(function(d) {return widthScale(d[0]);})
                .y0(function(d) {return heightScale(0);})
                .y1(function(d) {return heightScale(d[2]);});
        } else if (self.config.graph_units == 'dbm') {
            var area_min = d3.svg.area()
                .x(function(d) {return widthScale(d[0]);})
                .y0(function(d) {return heightScale(-123);})
                .y1(function(d) {return heightScale(d[1]);});
                
            var area_sum = d3.svg.area()
                .x(function(d) {return widthScale(d[0]);})
                .y0(function(d) {return heightScale(-123);})
                .y1(function(d) {return heightScale(d[3]);});
                
            var area_max = d3.svg.area()
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
            if (self.config.graph_units == 'rssi') {
                var area_reference = d3.svg.area()
                    .x(function(d) {return widthScale(d[0]);})
                    .y0(function(d) {return heightScale(0);})
                    .y1(function(d) {return heightScale(d[3]);});
            } else if (self.config.graph_units == 'dbm') {
                var area_reference = d3.svg.area()
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
            if (self.utilized_channels[i] >= self.config.start_frequency && self.utilized_channels[i] <= self.config.stop_frequency) {
                data.append("rect")
                    .style({'fill': '#3ebfbe', 'opacity': '0.5'})
                    .attr("width", 2)
                    .attr("height", height)
                    .attr("x", widthScale(self.utilized_channels[i]));
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
spectrum_analyzer.prototype.deep_copy = function(obj) {
    if (Object.prototype.toString.call(obj) === '[object Array]') {
        var out = [], i = 0, len = obj.length;
        for ( ; i < len; i++ ) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    
    if (typeof obj === 'object') {
        var out = {}, i;
        for ( i in obj ) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    
    return obj;
};

var SA = new spectrum_analyzer();

function tab_initialize_spectrum_analyzer() {
    ga_tracker.sendAppView('Spectrum Analyzer');
    
    $('#content').load("./tabs/spectrum_analyzer.html", function() {
        GUI.active_tab = 'spectrum_analyzer';
        
        // requesting to join spectrum analyzer
        if (debug) console.log('Requesting to join scanner mode');
        
        send_message(PSP.PSP_REQ_SCANNER_MODE, false, false, function() {
            GUI.operating_mode = 3; // switching operating mode to spectrum analyzer, this will swich receiving reading timer to analyzer read "protocol"
        
            // manually fire change event so variables get populated & send_config is triggered
            $('div#analyzer-configuration input:first').change(); 
        });

        // set input limits
        $('#start-frequency, #stop-frequency').prop('min', MIN_RFM_FREQUENCY / 1000000);
        $('#start-frequency, #stop-frequency').prop('max', MAX_RFM_FREQUENCY / 1000000);
        
        // Define some default values
        SA.config.pause = false;
        SA.config.reference = false;
        SA.config.utilized_channels = false;
        
        $('#start-frequency').val(parseFloat(SA.config.start_frequency / 1000).toFixed(1));
        $('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));
        $('#average-samples').val(SA.config.average_samples);
        $('#step-size').val(SA.config.step_size);   

        $('#plot-type').val(SA.config.graph_type);
        $('#plot-units').val(SA.config.graph_units);
        
        // Start rendering timer
        GUI.interval_add('SA_redraw_plot', function() {
            SA.redraw();
        }, 40, 1); // 40ms redraw = 25 fps
        
        // Generate "utilized channels" array that will be available as overlay, maximum should be 24
        SA.config.utilized_channels = false;
        SA.utilized_channels = [];
        
        for (var i = 0; i < BIND_DATA.hopchannel.length; i++) {
            if (BIND_DATA.hopchannel[i] != 0) { // only process valid channels
                var output = (BIND_DATA.rf_frequency + BIND_DATA.hopchannel[i] * BIND_DATA.rf_channel_spacing * 10000) / 1000; //kHz
                
                SA.utilized_channels.push(output);
            }
        }
        
        // UI hooks
        $('div#analyzer-configuration input').change(function() {
            // validate input fields
            var start = parseFloat($('#start-frequency').val()).toFixed(1) * 1000; // convert from MHz to kHz
            var stop = parseFloat($('#stop-frequency').val()).toFixed(1) * 1000; // convert from MHz to kHz
            var average_samples = parseInt($('#average-samples').val());
            var step_size = parseInt($('#step-size').val());
            
            if (isNaN(start)) $('#start-frequency').val((SA.config.start_frequency / 1000).toFixed(1));
            if (isNaN(stop))  $('#stop-frequency').val((SA.config.stop_frequency / 1000).toFixed(1));
            if (isNaN(average_samples)) $('#average-samples').val(SA.config.average_samples);
            if (isNaN(step_size)) $('#step-size').val(SA.config.step_size);
            
            var start_b = validate_input_bounds($('#start-frequency'));
            var stop_b = validate_input_bounds($('#stop-frequency'));
            var average_sample_b = validate_input_bounds($('#average-samples'));
            var step_size_b = validate_input_bounds($('#step-size'));
        
            if (start_b && stop_b && average_sample_b && step_size_b) {
                // update analyzer config with latest settings
                SA.config.start_frequency = start;
                SA.config.stop_frequency = stop;
                SA.config.average_samples = parseInt($('#average-samples').val());
                SA.config.step_size = parseInt($('#step-size').val());
                
                // simple min/max validation
                if (SA.config.stop_frequency <= SA.config.start_frequency) {
                    SA.config.stop_frequency = SA.config.start_frequency + 1000; // + 1kHz
                    
                    // also update UI with the corrected value
                    $('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));
                }        
                
                // loose focus (as it looks weird with focus on after changes are done)
                $('#start-frequency').blur();
                $('#stop-frequency').blur();
                
                SA.send_config();
            }
        });
        
        $('div#plot-configuration #plot-type').change(function() {
            SA.config.graph_type = String($('#plot-type').val());
        });
        
        $('div#plot-configuration #plot-units').change(function() {
            SA.config.graph_units = String($('#plot-units').val());
            
            // reset all needed arrays/variables
            SA.dataArray = [];
            
            if (SA.config.reference) {
                $('.save_reference').click();
            }
        });
        
        $("div#plot-configuration input[name='overtime-averaging']").change(function() {
            if ($(this).is(':checked')) {
                SA.config.overtime_averaging = true;
                SA.dataArray = [];
            } else {
                SA.config.overtime_averaging = false;
                SA.dataArray = [];
            }
        });
        
        // Pause/Resume handler
        $('.pause-resume').click(function() {
            var clicks = $(this).data('clicks');
            
            if (!clicks) {
                SA.config.pause = true;
                GUI.interval_remove('SA_redraw_plot');
                
                $(this).text('Resume').addClass('resume');        
            } else {
                SA.config.pause = false;
                
                GUI.interval_add('SA_redraw_plot', function() {
                    SA.redraw();
                }, 40);
                
                $(this).text('Pause').removeClass('resume');  
            }
            
            $(this).data("clicks", !clicks);      
        });  

        // Reference handler
        $('.save_reference').click(function() {
            var clicks = $(this).data('clicks');
            
            if (!clicks) {
                SA.reference_dataArray = SA.deep_copy(SA.dataArray);
                SA.config.reference = true;
                SA.redraw();
                
                $(this).text('Disable Reference').addClass('active');
            } else {  
                SA.reference_dataArray = [];
                SA.config.reference = false;
                SA.redraw();
                
                $(this).text('Enable Reference').removeClass('active');
            }
            
            $(this).data("clicks", !clicks); 
        });
        
        // Hopchannel handler
        $('.display_hopchannels').click(function() {
            var clicks = $(this).data('clicks');
            
            if (!clicks) {
                SA.config.utilized_channels = true;
                SA.redraw();
                
                $(this).text('Hide Hop Channels').addClass('active');
            } else {
                SA.config.utilized_channels = false;
                SA.redraw();
                
                $(this).text('Display Hop Channels').removeClass('active');
            }
            
            $(this).data("clicks", !clicks); 
        });
    });
}

var SA_message_buffer = new Array();
function SA_char_read(readInfo) {
    if (readInfo && readInfo.bytesRead > 0) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                SA.process_message(SA_message_buffer);
                
                // empty buffer
                SA_message_buffer = [];
            } else {            
                SA_message_buffer.push(data[i]);
            }
        }
    }
}
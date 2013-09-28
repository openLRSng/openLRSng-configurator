var spectrum_analyzer = function() {
    this.config = {
        start_frequency:    425000,
        stop_frequency:     435000,
        average_samples:    500,
        step_size:          50,
        graph_type:         'area',
        overtime_averaging: false
    };
    
    this.dataArray = [];
    this.reference_dataArray = [];
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
    
    // var index = (message.frequency - config.start_frequency) / config.step_size;
    
    // don't let array values go overboard
    if (message.frequency < this.config.start_frequency || message.frequency > this.config.stop_frequency) {
        return;
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
    });
};

spectrum_analyzer.prototype.redraw = function() {
    var self = this;
    
    self.dataArray.sort(); // sort array members (in case of "jumps")
    
    $('svg').empty();
    
    var width = 900;
    var height = 270;
    var canvas = d3.select("svg");
    
    var widthScale = d3.scale.linear()
        .domain([self.config.start_frequency, self.config.stop_frequency])
        .range([0, width - 60]);
    
    var heightScale = d3.scale.linear()
        .domain([0, 255])
        .range([height - 20, 0]);

    var xAxis = d3.svg.axis()
        .scale(widthScale)
        .orient("bottom")
        .tickFormat(function(d) {return d / 1000;});

    var yAxis = d3.svg.axis()
        .scale(heightScale)
        .orient("left");
    
    // render xAxis
    canvas.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(40, 250)") // left 34, top 380
        .call(xAxis);
        
    // render yAxis
    canvas.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(40, 0)") // left 40, top 0
        .call(yAxis);    
    
    if (self.config.graph_type == 'area') {
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
        
        // render data
        var data = canvas.append("g").attr("name", "data");
        
        data.append("path")
            .style({'fill': '#f7464a'})
            .attr("transform", "translate(41, 0)")
            .attr("d", area_max(self.dataArray));   
         
        data.append("path")
            .style({'fill': '#949fb1'})
            .attr("transform", "translate(41, 0)")
            .attr("d", area_sum(self.dataArray));     
         
        data.append("path")
            .style({'fill': '#e2eae9'})
            .attr("transform", "translate(41, 0)")
            .attr("d", area_min(self.dataArray));
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
        
        // render data
        var data = canvas.append("g").attr("name", "data");
        
        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#f7464a', 'fill': 'none'})
            .attr("transform", "translate(41, 0)")
            .attr("d", line_max(self.dataArray));   
         
        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#949fb1', 'fill': 'none'})
            .attr("transform", "translate(41, 0)")
            .attr("d", line_sum(self.dataArray));     
         
        data.append("path")
            .style({'stroke-width': '2px', 'stroke': '#e2eae9', 'fill': 'none'})
            .attr("transform", "translate(41, 0)")
            .attr("d", line_min(self.dataArray));
    }
    
    if (self.config.overtime_averaging) {
        if (typeof self.dataArray[0][4] != 'undefined') {
            $('span.overtime-averaging-counter').text(self.dataArray[0][4]);
        }
    } else {
        $('span.overtime-averaging-counter').text(0);
    }
};

var SA = new spectrum_analyzer();

function tab_initialize_spectrum_analyzer() {
    ga_tracker.sendAppView('Spectrum Analyzer');
    
    $('#content').load("./tabs/spectrum_analyzer.html", function() {
        // switching operating mode to spectrum analyzer, this will swich receiving reading timer to analyzer read "protocol"
        GUI.operating_mode = 3;
        
        // requesting to join spectrum analyzer
        command_log('Requesting to enter scanner mode');
        send_message(PSP.PSP_REQ_SCANNER_MODE, 1, function() {
            // manually fire change event so variables get populated
            $('div#analyzer-configuration input:first').change(); 
        });

        // set input limits
        $('#start-frequency, #stop-frequency').prop('min', MIN_RFM_FREQUENCY / 1000000);
        $('#start-frequency, #stop-frequency').prop('max', MAX_RFM_FREQUENCY / 1000000);
        
        
        GUI.interval_add('SA_redraw_plot', function() {
            SA.redraw();
        }, 40); // 40ms redraw = 25 fps
        
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
        
        $('div#plot-configuration select').change(function() {
            SA.config.graph_type = String($('#plot-type').val());

            // sending configuration in this case is meant only to re-initialize arrays due to unit change
            SA.send_config();
        });
        
        $('div#plot-configuration input').change(function() {
            if ($(this).is(':checked')) {
                SA.config.overtime_averaging = true;
            } else {
                SA.config.overtime_averaging = false;
            }
            
            // sending configuration in this case is meant only to re-initialize arrays due to unit change
            SA.send_config();
        });
        
        // Define some default values
        $('#start-frequency').val(parseFloat(SA.config.start_frequency / 1000).toFixed(1));
        $('#stop-frequency').val(parseFloat(SA.config.stop_frequency / 1000).toFixed(1));
        $('#average-samples').val(SA.config.average_samples);
        $('#step-size').val(SA.config.step_size);
        
        e_averaging_counter = $('span.overtime-averaging-counter');
        
        // Pause/Resume handler
        $('.pause-resume').click(function() {
            var clicks = $(this).data('clicks');
            
            if (clicks) { // odd number of clicks
                // empty buffer manually (.flush doesn't seem to work here for some reason)
                chrome.serial.read(connectionId, 1048575, function() {});
                
                GUI.interval_add('SA_redraw_plot', function() {
                    SA.redraw();
                }, 40);
                
                $(this).text('Pause').removeClass('resume');        
            } else { // even number of clicks
                GUI.interval_remove('SA_redraw_plot');
                
                SA.redraw();
                
                $(this).text('Resume').addClass('resume');  
            }
            
            $(this).data("clicks", !clicks);      
        });        

        SA.redraw();
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
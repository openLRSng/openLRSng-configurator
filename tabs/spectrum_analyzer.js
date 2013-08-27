function tab_initialize_spectrum_analyzer() {
    ga_tracker.sendAppView('Spectrum Analyzer');
    
    $('#content').load("./tabs/spectrum_analyzer.html", function() {
        // switching operating mode to spectrum analyzer, this will swich receiving reading timer to analyzer read "protocol"
        GUI.operating_mode = 3;
        
        // requesting to join spectrum analyzer
        command_log('Requesting to enter scanner mode');
        send_message(PSP.PSP_REQ_SCANNER_MODE, 1);
        
        // data holding variables & configuration
        plot;
        plot_data = new Array(4);
        plot_data_avr_sum = new Array();
        
        analyzer_config = {
            start_frequency: 425000,
            stop_frequency:  435000,
            average_samples: 500,
            step_size:       50
        };

        plot_config = {
            type: 'lines',
            units: 1,
            overtime_averaging: 0
        };
        
        GUI.interval_add('SA_redraw_plot', SA_redraw_plot, 40); // 40ms redraw = 25 fps
        
        // UI hooks
        $('div#analyzer-configuration select, div#analyzer-configuration input').change(function() {
            // update analyzer config with latest settings
            analyzer_config.start_frequency = parseFloat($('#start-frequency').val()).toFixed(1) * 1000; // convert from MHz to kHz
            analyzer_config.stop_frequency = parseFloat($('#stop-frequency').val()).toFixed(1) * 1000; // convert from MHz to kHz
            analyzer_config.average_samples = parseInt($('#average-samples').val());
            analyzer_config.step_size = parseInt($('#step-size').val());
            
            // simple min/max validation
            if (analyzer_config.stop_frequency <= analyzer_config.start_frequency) {
                analyzer_config.stop_frequency = analyzer_config.start_frequency + 1000; // + 1kHz
                
                // also update UI with the corrected value
                $('#stop-frequency').val(parseFloat(analyzer_config.stop_frequency / 1000).toFixed(1));
            }        
            
            // loose focus (as it looks weird with focus on after changes are done)
            $('#start-frequency').blur();
            $('#stop-frequency').blur();
            
            SA_send_config();
        });
        
        $('div#plot-configuration select').change(function() {
            plot_config.type = String($('#plot-type').val());
            
            plot_options.defaultType = plot_config.type;
            // sending configuration in this case is meant only to re-initialize arrays due to unit change
            SA_send_config();
        });
        
        $('div#plot-configuration input').change(function() {
            if ($(this).is(':checked')) {
                plot_config.overtime_averaging = 1;
            } else {
                plot_config.overtime_averaging = 0;
            }
            
            // sending configuration in this case is meant only to re-initialize arrays due to unit change
            SA_send_config();
        });
        
        var e_start_frequency = $('#start-frequency');
        var e_stop_frequency = $('#stop-frequency');
        
        var e_average_samples = $('#average-samples');
        for (var i = 100; i < 1501; i += 100) {
            
            e_average_samples.append($("<option/>", {
                value: i,
                text: i
            }));        
        }
        
        var e_step_size = $('#step-size');
        for (var i = 1; i < 100; i += 1) {
            e_step_size.append($("<option/>", {
                value: i,
                text: i
            }));        
        }
        
        // Define some defualt values
        e_start_frequency.val(parseFloat(analyzer_config.start_frequency / 1000).toFixed(1));
        e_stop_frequency.val(parseFloat(analyzer_config.stop_frequency / 1000).toFixed(1));
        e_average_samples.val(analyzer_config.average_samples);
        e_step_size.val(analyzer_config.step_size);
        
        // manually fire change event so variables get populated
        $('div#analyzer-configuration select').change(); 
        
        e_averaging_counter = $('span.overtime-averaging-counter');
        
        // Pause/Resume handler
        $('.pause-resume').click(function() {
            var clicks = $(this).data('clicks');
            
            if (clicks) { // odd number of clicks
                // empty buffer manually (.flush doesn't seem to work here for some reason)
                chrome.serial.read(connectionId, 1048575, function() {});
                
                GUI.interval_add('SA_redraw_plot', SA_redraw_plot, 40);
                
                plot_options.mouse.track = false;
                
                $(this).text('Pause').removeClass('resume');        
            } else { // even number of clicks
                GUI.interval_remove('SA_redraw_plot');
                
                plot_options.mouse.track = true;
                SA_redraw_plot();
                
                $(this).text('Resume').addClass('resume');  
            }
            
            $(this).data("clicks", !clicks);      
        });        
        
        // Plot
        element_plot = document.getElementById("plot");
        
        plot_options = {
            defaultType: plot_config.type,
            colors: ['#d60606', '#00a8f0', '#c0d800'],
            shadowSize: 0,
            yaxis: {
                max: 240,
                min: 0,
                noTicks: 12,
                autoscale: true
            },
            xaxis: {
                noTicks: 10,
                max: analyzer_config.stop_frequency,
                min: analyzer_config.start_frequency,
                tickFormatter: function(x) {
                    var x = parseInt(x);
                    //x /= 100;
                    return x + ' kHz';
                }
            },
            grid: {
                backgroundColor: "#FFFFFF"
            },
            legend: {
                position: "wn",
                backgroundOpacity: 0
            },
            mouse: {
                track: false,
                relative: true,
                margin: 10,
                fillOpacity: 1,
                trackFormatter: function(x) {
                    var frequency = x.x;
                    var val = x.y;
                    
                    return frequency + ' kHz @ ' + val;
                }
            }
        }

        SA_redraw_plot();
    });
}

var SA_message_buffer = new Array();
function SA_char_read(readInfo) {
    if (readInfo && readInfo.bytesRead > 0) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                SA_process_message(SA_message_buffer);
                
                // empty buffer
                SA_message_buffer = [];
            } else {            
                SA_message_buffer.push(data[i]);
            }
        }
    }
}

var last_index = 0;
function SA_process_message(message_buffer) {
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
    
    var index = (message.frequency - analyzer_config.start_frequency) / analyzer_config.step_size;
    
    if (index <= plot_data[0].length) {     
        // doing pre-comupation to save (optimize) cycles, the "reverse" force for dBm should be applied here (* -1)
        var c_RSSI_MAX = message.RSSI_MAX * plot_config.units;
        var c_RSSI_SUM = message.RSSI_SUM * plot_config.units;
        var c_RSSI_MIN = message.RSSI_MIN * plot_config.units;
        
        if (plot_config.overtime_averaging == 1) {
            if (plot_data_avr_sum[index] != undefined) {
                if (c_RSSI_MAX > plot_data[0][index][1]) plot_data[0][index] = [message.frequency, c_RSSI_MAX];
                if (c_RSSI_SUM > plot_data[1][index][1]) plot_data[1][index] = [message.frequency, c_RSSI_SUM];
                if (c_RSSI_MIN < plot_data[2][index][1] || plot_data[2][index][1] == 0) plot_data[2][index] = [message.frequency, c_RSSI_MIN];
                
                plot_data_avr_sum[index][1] += 1;
                plot_data_avr_sum[index] = [plot_data_avr_sum[index][0] + c_RSSI_SUM, plot_data_avr_sum[index][1]];
                plot_data[3][index] = [message.frequency, plot_data_avr_sum[index][0] / plot_data_avr_sum[index][1]];
            }
        } else {
            plot_data[0][index] = [message.frequency, c_RSSI_MAX];
            plot_data[1][index] = [message.frequency, c_RSSI_SUM];
            plot_data[2][index] = [message.frequency, c_RSSI_MIN];
        }
    }
    
    last_index = index;
}

function SA_redraw_plot() {
    plot = Flotr.draw(element_plot, [ 
        {data: plot_data[0], lines: {fill: false}}, 
        {data: plot_config.overtime_averaging ? plot_data[3] : plot_data[1], lines: {fill: false}}, 
        {data: plot_data[2], lines: {fill: true}} ], plot_options);  
        
    // Update averaging counter
    if (plot_config.overtime_averaging) {
        e_averaging_counter.html(plot_data_avr_sum[0][1]);
    } else {
        e_averaging_counter.html(0);
    }
}

function SA_send_config() {
    var ascii_out = "#" + 
        analyzer_config.start_frequency.toString() + "," + 
        analyzer_config.stop_frequency.toString() + "," + 
        analyzer_config.average_samples.toString() + "," + 
        analyzer_config.step_size.toString() + ",";
        
    send(ascii_out, function() {
        // drop current data and re-populate the array
        var array_size = ((analyzer_config.stop_frequency) - (analyzer_config.start_frequency)) / analyzer_config.step_size;
        
        plot_data[0] = [];
        plot_data[1] = [];
        plot_data[2] = [];
        plot_data[3] = [];
        plot_data_avr_sum = [];
        
        for (var i = 0; i <= array_size; i++) {
            plot_data[0][i] = [1000000, 0];
            plot_data[1][i] = [1000000, 0];
            plot_data[2][i] = [1000000, 0];
            plot_data[3][i] = [1000000, 0];
            plot_data_avr_sum[i] = [0, 0]; // sum, samples_n
        }
        
        // Update plot
        plot_options.xaxis.max = analyzer_config.stop_frequency;
        plot_options.xaxis.min = analyzer_config.start_frequency;  
    });
}
function tab_initialize_rx_module(connected) {    
    if (connected != 1) {
        $('#content').html('Please <strong>wait</strong> for the transmitter to establish connection with receiver module. <br />\
        Receiver always binds on bootup for <strong>0.5s</strong>, if this fails try <strong>bridging</strong> CH1-CH2 on your receiver with a jumper.');
    
        command_log('Trying to establish connection with the RX module ...');
        send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, 1);
    } else {
        $('#content').load("./tabs/rx_module.html", function() {
            // fill in the values
            $('input[name="failsafe_delay"]').val(RX_CONFIG.failsafe_delay);

            if (bit_check(RX_CONFIG.flags, 1)) { // PWM
                $('select[name="stop_pwm_failsafe"]').val(1);
            }            
            
            if (bit_check(RX_CONFIG.flags, 0)) { // PPM
                $('select[name="stop_ppm_failsafe"]').val(1);
            }
            
            
            $('input[name="sync_time"]').val(RX_CONFIG.minsync);
            $('select[name="rssi_inject"]').val(RX_CONFIG.RSSIpwm);
            
            if (RX_CONFIG.beacon_frequency == 0) { // disabled
                $('select[name="beacon_frequency"]').val(0);
            } else if (RX_CONFIG.beacon_frequency > 447000000) { // FRS
                var calc = RX_CONFIG.beacon_frequency - 462537500;
                
                var chan = 0;
                while (calc != 0) {
                    calc -= 25000;
                    chan++;
                }
                
                $('select[name="beacon_frequency"]').val(chan);
            } else { // PMR
                var calc = RX_CONFIG.beacon_frequency - 445993750;
                
                var chan = 0;
                while (calc != 0) {
                    calc -= 12500;
                    chan++;
                }
                
                $('select[name="beacon_frequency"]').val(chan + 10); // + 10 because we are using the second sequence of channels
            }
            
            
            $('input[name="beacon_interval"]').val(RX_CONFIG.beacon_interval);
            $('input[name="beacon_deadtime"]').val(RX_CONFIG.beacon_deadtime);
            
            // channel output stuff
            var channel_output_generated = 0;
            $('div.channel_output select').each(function() {                
                channel_output_list($(this), channel_output_generated++, RX_CONFIG.rx_type);
            });
            
            // select values have been generated, now select each one of them according to RX_CONFIG
            var channel_output_port_key = 0;
            $('div.channel_output select').each(function() {
                $(this).val(RX_CONFIG.pinMapping[channel_output_port_key++]);
            });
            
            // UI Hooks
            $('a.restore').click(function() {
                send_message(PSP.PSP_SET_RX_RESTORE_DEFAULT, 1);
                
                setTimeout(function() {
                    // request restored configuration
                    send_message(PSP.PSP_REQ_RX_CONFIG, 1);
                    setTimeout(function() {
                        tab_initialize_rx_module(); // we need to refresh this tab
                    }, 100);
                }, 250);
            });
            
            $('a.save_to_eeprom').click(function() {
                // we need to "grasp" all values from the UI, store it in the local RX_CONFIG object
                // send this object to the module and then request EEPROM save
                RX_CONFIG.failsafe_delay = parseInt($('input[name="failsafe_delay"]').val());
                
                if (parseInt($('select[name="stop_pwm_failsafe"]').val()) == 1) {
                    RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 1);
                } else {
                    RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 1);
                }
                
                if (parseInt($('select[name="stop_ppm_failsafe"]').val()) == 1) {
                    RX_CONFIG.flags = bit_set(RX_CONFIG.flags, 0);
                } else {
                    RX_CONFIG.flags = bit_clear(RX_CONFIG.flags, 0);
                }
                
                RX_CONFIG.minsync = parseInt($('input[name="sync_time"]').val());
                RX_CONFIG.RSSIpwm = parseInt($('select[name="rssi_inject"]').val());
                
                var temp_beacon_frequency = parseInt($('select[name="beacon_frequency"]').val());
                if (temp_beacon_frequency == 0) {
                    RX_CONFIG.beacon_frequency = 0;
                } else if (temp_beacon_frequency < 8) { // FRS
                    var calc = 462537500 + 25000 * temp_beacon_frequency;
                    
                    RX_CONFIG.beacon_frequency = calc;
                } else { // PMR
                    var calc = 445993750 + 12500 * (temp_beacon_frequency - 10); // - 10 because we are using the second sequence of channels
                    
                    RX_CONFIG.beacon_frequency = calc;
                }
                
                RX_CONFIG.beacon_interval = parseInt($('input[name="beacon_interval"]').val());
                RX_CONFIG.beacon_deadtime = parseInt($('input[name="beacon_deadtime"]').val());
                
                var channel_output_port_key = 0;
                $('div.channel_output select').each(function() {
                    RX_CONFIG.pinMapping[channel_output_port_key++] = $(this).val();
                });
                
                send_RX_config();
            });
        });
    }
}

function channel_output_list(element, index, rx_type) {
    for (var i = 0; i < 16; i++) {
        element.append('<option value="' + i + '">' + (i + 1) + '</option>');
    }
    
    // generate special functions
    channel_output_special_functions(element, index, rx_type);
}

function channel_output_special_functions(element, index, rx_type) {
    switch (rx_type) {
        case 1: // RX_FLYTRON8CH
            if (index == 0) {
                element.append('<option value="' + PIN_MAP.RSSI + '">RSSI (8kHz PWM)</option>');
            } else if (index == 5) {
                element.append('<option value="' + PIN_MAP.PPM + '">PPM</option>');
            } else if (index == 9) {
                element.append('<option value="' + PIN_MAP.SDA + '">SDA</option>');
                element.append('<option value="' + PIN_MAP.ANALOG + '">Analogue Input</option>');
            } else if (index == 10) {
                element.append('<option value="' + PIN_MAP.SCL + '">SCL</option>');
                element.append('<option value="' + PIN_MAP.ANALOG + '">Analogue Input</option>');
            } else if (index == 11) {
                element.append('<option value="' + PIN_MAP.RXD + '">RXD</option>');
            } else if (index == 12) {
                element.append('<option value="' + PIN_MAP.TXD + '">TXD</option>');
            }
            break;
        case 2: // RX_OLRSNG4CH
            if (index == 0) {
                element.append('<option value="' + PIN_MAP.PPM + '">PPM</option>');
            } else if (index == 1) {
                element.append('<option value="' + PIN_MAP.SDA + '">SDA</option>');
                element.append('<option value="' + PIN_MAP.ANALOG + '">Analogue Input</option>');
            } else if (index == 2) {
                element.append('<option value="' + PIN_MAP.RSSI + '">RSSI (8kHz PWM)</option>');
            } else if (index == 3) {
                element.append('<option value="' + PIN_MAP.SCL + '">SCL</option>');
                element.append('<option value="' + PIN_MAP.ANALOG + '">Analogue Input</option>');
            } else if (index == 4) {
                element.append('<option value="' + PIN_MAP.RXD + '">RXD</option>');
            } else if (index == 5) {
                element.append('<option value="' + PIN_MAP.TXD + '">TXD</option>');
            }
            break;
        case 3: // RX_OLRSNG12CH
            break;
    }
}
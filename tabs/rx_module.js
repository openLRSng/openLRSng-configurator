function tab_initialize_rx_module(connected) {    
    ga_tracker.sendAppView('RX Module');
    
    if (connected != 1) {
        $('#content').load("./tabs/rx_connecting.html", function() {
            GUI.active_tab = 'rx_connecting';
            
            // UI hooks
            $('a.retry').click(function() {
                $(this).hide();
                
                // start countdown timer
                var rx_join_configuration_counter = 30;
                GUI.interval_add('RX_join_configuration', function() {
                    rx_join_configuration_counter--;
                    
                    $('span.countdown').html(rx_join_configuration_counter);
                    
                    if (rx_join_configuration_counter <= 0) {
                        // stop counter (in case its still running)
                        GUI.interval_remove('RX_join_configuration');
                    }
                }, 1000);
                
                // request to join RX configuration via wifi
                if (debug) console.log('Requesting to join RX wifi configuration');
                command_log('Trying to establish connection with the RX module ...');
                
                send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, false, false, function(result) {
                    GUI.interval_remove('RX_join_configuration'); // stop counter
                    
                    if (GUI.active_tab == 'rx_connecting') {
                        var connected_to_RX = parseInt(result.data.getUint8(0));
                        switch (connected_to_RX) {
                            case 1:
                                if (debug) console.log('Connection to the RX successfully established');
                                command_log('Connection to the receiver module <span style="color: green">successfully</span> established.');
                                send_message(PSP.PSP_REQ_RX_CONFIG, false, false, function() {
                                    send_message(PSP.PSP_REQ_SPECIAL_PINS, false, false, function() {
                                        send_message(PSP.PSP_REQ_NUMBER_OF_RX_OUTPUTS, false, false, function() {
                                            tab_initialize_rx_module(true); // load standard RX module html
                                        });
                                    });
                                });
                                break;
                            case 2:
                                if (debug) console.log('Connection to the RX timed out');
                                command_log('Connection to the RX module timed out.');
                                $('a.retry').show();
                                break;
                            case 3:
                                if (debug) console.log('Failed response from the RX module');
                                command_log('Failed response from the RX module.');
                                $('a.retry').show();
                                break;
                        }
                    } else {
                        if (debug) console.log('Connection request to the RX was canceled');
                        command_log('Connection request to the RX module was canceled.');
                    }
                });
            }).click(); // software click to trigger this
        });
    } else {
        GUI.active_tab = 'rx_module';
        
        $('#content').load("./tabs/rx_module.html", function() {
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
            
            $('input[name="sync_time"]').val(RX_CONFIG.minsync);
            $('select[name="rssi_inject"]').val(RX_CONFIG.RSSIpwm);
            
            // failsafe
            $('input[name="failsafe_delay"]').val(RX_CONFIG.failsafe_delay);
            $('input[name="stop_pwm_failsafe"]').val(RX_CONFIG.pwmStopDelay);
            $('input[name="stop_ppm_failsafe"]').val(RX_CONFIG.ppmStopDelay);
            
            // beacon
            $('div.beacon span.note').prop('title', 
                'Supported frequency range: ' + (MIN_RFM_FREQUENCY / 1000).toFixed(0) + ' khz - ' + (MAX_RFM_FREQUENCY / 1000).toFixed(0) + ' khz');
            
            $('input[name="beacon_frequency"]').val(RX_CONFIG.beacon_frequency);         
            $('input[name="beacon_interval"]').val(RX_CONFIG.beacon_interval);
            $('input[name="beacon_deadtime"]').val(RX_CONFIG.beacon_deadtime);
            
            // info
            var board;
            switch (RX_CONFIG.rx_type) {
                case 1:
                    board = 'Flytron / Orange RX 8 channel';
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
                default:
                    board = 'Unknown';
            }
            $('div.info span.board').html(board);
            
            // channel output stuff
            var channel_output_generated = 0;
            $('div.channel_output select').each(function() {                
                channel_output_list($(this), channel_output_generated++);
            });
            
            // select values have been generated, now select each one of them according to RX_CONFIG
            var channel_output_port_key = 0;
            $('div.channel_output select').each(function() {
                $(this).val(RX_CONFIG.pinMapping[channel_output_port_key++]);
            });
            
            // UI Hooks
            // update failsafe sliders
            $('input[name="failsafe_delay"]').change(function() {
                failsafe_update_slider(this, $('span.failsafe_delay_val'));
            }).change();
            
            $('input[name="stop_pwm_failsafe"]').change(function() {
                failsafe_update_slider(this, $('span.stop_pwm_failsafe_val'));
            }).change();
            
            $('input[name="stop_ppm_failsafe"]').change(function() {
                failsafe_update_slider(this, $('span.stop_ppm_failsafe_val'));
            }).change();
            
            // beacon hybrid element
            $('select[name="beacon_frequency_helper"]').prop('selectedIndex', -1); // go out of range to also capture "disabled"
            
            $('select[name="beacon_frequency_helper"]').change(function() {
                $('input[name="beacon_frequency"]').val((parseInt($(this).val()) / 1000).toFixed(0)); // convert from mhz to khz
            });
            
            // restore from file
            $('a.restore_from_file').click(function() {
                restore_object_from_file(RX_CONFIG, 'RX_configuration_backup', function(result) {
                    command_log('Configuration <span style="color: green">successfully</span> restored from file');
                    
                    // save data in eeprom
                    send_RX_config();
                    
                    // reload tab
                    // adding 250ms delay so console messages are printed in the right order (takes a while for eeprom save result to return)
                    GUI.timeout_add('re_initialize_rx_tab', function() {
                        tab_initialize_rx_module();
                    }, 250);
                });
            });
            
            // save to file
            $('a.save_to_file').click(function() {
                save_object_to_file(RX_CONFIG, 'RX_configuration_backup', function(result) {
                    command_log('Configuration was saved <span style="color: green">successfully</span>');
                });
            });
        
            // restore default
            $('a.restore_default').click(function() {
                send_message(PSP.PSP_SET_RX_RESTORE_DEFAULT, 1);
                
                GUI.timeout_add('RX_request_restored_configuration', function() {
                    // request restored configuration
                    send_message(PSP.PSP_REQ_RX_CONFIG, 1);
                    
                    GUI.timeout_add('reinitialized_rx_tab', function() {
                        tab_initialize_rx_module(); // we need to refresh this tab
                    }, 100);
                }, 250);
            });
            
            $('a.save_to_eeprom').click(function() {
                // input fields validation
                var validation = new Array(); // validation results will be stored in this array
                
                validation.push(validate_input_bounds($('input[name="sync_time"]')));
                validation.push(validate_input_bounds($('input[name="beacon_interval"]')));
                validation.push(validate_input_bounds($('input[name="beacon_deadtime"]')));
                
                var validation_result = true;
                for (var i = 0; i < validation.length; i++) {
                    if (validation[i] != true) {
                        // validation failed
                        validation_result = false;
                    }
                }
                
                // custom beacon frequency validation
                var beacon_frequency = parseInt($('input[name="beacon_frequency"]').val()) * 1000; // convert from khz to mhz
                
                if (beacon_frequency == 0 || beacon_frequency >= MIN_RFM_FREQUENCY && beacon_frequency <= MAX_RFM_FREQUENCY) {
                    // all valid
                    $('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').removeClass('validation_failed');
                } else {
                    validation_result = false;
                    
                    $('input[name="beacon_frequency"], select[name="beacon_frequency_helper"]').addClass('validation_failed');
                }
                
                
                if (validation_result) {
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
                    
                    
                    RX_CONFIG.minsync = parseInt($('input[name="sync_time"]').val());
                    RX_CONFIG.RSSIpwm = parseInt($('select[name="rssi_inject"]').val());
                    
                    RX_CONFIG.pwmStopDelay = parseInt($('input[name="stop_pwm_failsafe"]').val());
                    RX_CONFIG.ppmStopDelay = parseInt($('input[name="stop_ppm_failsafe"]').val());
                    
                    RX_CONFIG.beacon_frequency = parseInt($('input[name="beacon_frequency"]').val());
                    RX_CONFIG.beacon_interval = parseInt($('input[name="beacon_interval"]').val());
                    RX_CONFIG.beacon_deadtime = parseInt($('input[name="beacon_deadtime"]').val());
                    
                    var channel_output_port_key = 0;
                    $('div.channel_output select').each(function() {
                        RX_CONFIG.pinMapping[channel_output_port_key++] = $(this).val();
                    });
                    
                    send_RX_config();
                } else {
                    command_log('One or more fields didn\'t pass the validation process, they should be highligted with <span style="color: red">red</span> border');
                    command_log('Please try to enter appropriate value, otherwise you <span style="color: red">won\'t</span> be able to save settings in EEPROM');
                }
            });
        });
    }
}

function channel_output_list(element, index) {
    for (var i = 0; i < 16; i++) {
        element.append('<option value="' + i + '">' + (i + 1) + '</option>');
    }
    
    // generate special functions
    channel_output_special_functions(element, index);
}

function channel_output_special_functions(element, index) {
    // we used analog 0 and 1 in this sequence while it was statick, we might consider using it again
    if (index < numberOfOutputsOnRX) {
        for (var i = 0; i < RX_SPECIAL_PINS.length; i++) {
            var data = RX_SPECIAL_PINS[i];
            
            if (data.pin == index) {
                element.append('<option value="' + data.type + '">' + PIN_MAP[data.type] + '</option>');
            }
        }
    } else if (index >= numberOfOutputsOnRX) {
        element.html(''); // empty the select area
    }
}

// non linear mapping
// 0 - disabled
// 1-99    - 100ms - 9900ms (100ms res)
// 100-189 - 10s  - 99s   (1s res)
// 190-209 - 100s - 290s (10s res)
// 210-255 - 5m - 50m (1m res)
function failsafe_update_slider(slider_element, text_element) {
    var val = parseInt($(slider_element).val());
    
    if (val == 0) {
        text_element.html('Disabled');
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
}
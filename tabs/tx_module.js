function tab_initialize_tx_module() {
    ga_tracker.sendAppView('TX Module');
    
    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function() {
        // Basic settings
        if (BIND_DATA.rf_frequency > 463000000) {
            if (BIND_DATA.rf_frequency > 888000000) {
                // RFMXX_915
                $('select[name="RFM_type"]').val(2);
            } else {
                // RFMXX_868
                $('select[name="RFM_type"]').val(1);
            }
        } else { 
            // this "is" a default 433 module
            $('select[name="RFM_type"]').val(0);
        }
        
        // set bounds
        $('select[name="RFM_type"]').change(function() {
            hw_frequency_limits(parseInt($('select[name="RFM_type"]').val()));
            $('input[name="operating_frequency"]').prop('min', MIN_RFM_FREQUENCY / 1000);
            $('input[name="operating_frequency"]').prop('max', MAX_RFM_FREQUENCY / 1000);
            
            $('input[name="maximum_desired_frequency"]').prop('min', MIN_RFM_FREQUENCY / 1000);
            $('input[name="maximum_desired_frequency"]').prop('max', MAX_RFM_FREQUENCY / 1000);
        });
        $('select[name="RFM_type"]').change(); // fire change event manually
        
        
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000); // parsing from HZ to kHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
        $('select[name="serial_baudrate"]').val(BIND_DATA.serial_baudrate);
        $('select[name="data_rate"]').val(BIND_DATA.modem_params);
        
        if (bit_check(BIND_DATA.flags, 3)) {
            var telemetry = true;
            var frsky_telemetry = false;
            
            if (bit_check(BIND_DATA.flags, 4)) {
                frsky_telemetry = true;
            }
            
            if (frsky_telemetry) {
                $('select[name="telemetry"]').val(2);
            } else {
                $('select[name="telemetry"]').val(1);
            }
        } else {
            $('select[name="telemetry"]').val(0);
        }
        
        // first we will remove the telemetry bits (doesn't matter if its high or low at this point)
        var rc_channel_config = bit_clear(BIND_DATA.flags, 3); // telemetry
        rc_channel_config = bit_clear(rc_channel_config, 4); // frsky
        $('select[name="channel_config"]').val(rc_channel_config);

        // Advanced settings
        // Calculate number of hop channels
        var hopcount = 0;
        for (var i = 0; i < 24; i++) {
            if (BIND_DATA.hopchannel[i] != 0) {
                hopcount++;
            }
        }
        
        $('input[name="hopcount"]').val(hopcount);
        
        // Info / Hop Channels
        generate_info_refresh();
        generate_info_list();
        
        $('input[name="maximum_desired_frequency"]').val(max_frequency); // setting this input after max_frequency was created
        
        // UI hooks
        $('select[name="data_rate"], select[name="telemetry"], select[name="channel_config"]').change(function() {
            generate_info_refresh();
        });
        
        $('input[name="operating_frequency"], input[name="channel_spacing"]').change(function() {
            generate_info_list();
        });
        
        $('input[name="hopcount"]').change(function() {
            randomize_hopchannels();
        });
        
        $('a.randomize').click(function() {
            randomize_hopchannels();
        });
        
        $('input[name="maximum_desired_frequency"]').change(function() {
            if (parseInt($('input[name="maximum_desired_frequency"]').val()) < max_frequency) { // we need to apply restrictions
                randomize_hopchannels();
            }
        });
        
        $('a.restore').click(function() {
            send_message(PSP.PSP_SET_TX_RESTORE_DEFAULT, 1);
            
            setTimeout(function() {
                // request restored configuration
                send_message(PSP.PSP_REQ_BIND_DATA, 1);
                setTimeout(function() {
                    tab_initialize_tx_module(); // we need to refresh this tab
                }, 100);
            }, 50);
        });
        
        $('a.save_to_eeprom').click(function() {
            // input fields validation
            var validation = new Array(); // validation results will be stored in this array
            
            validation.push(validate_input_bounds($('input[name="operating_frequency"]')));
            validation.push(validate_input_bounds($('input[name="rf_power"]')));
            validation.push(validate_input_bounds($('input[name="channel_spacing"]')));
            validation.push(validate_input_bounds($('input[name="hopcount"]')));
            validation.push(validate_input_bounds($('input[name="maximum_desired_frequency"]')));
            
            var validation_result = true;
            for (var i = 0; i < validation.length; i++) {
                if (validation[i] != true) {
                    // validation failed
                    validation_result = false;
                }
            }
            
            // fire change event on hop_channel list elemets to run custom_hop_list validation
            $('div.hop_channels ul.list input:first').change();
            
            if (validation_result && custom_hopchannel_list_valid) {
                // Basic settings
                // we need to "grasp" all values from the UI, store it in the local BIND_DATA object
                // send this object to the module and then request EEPROM save
                BIND_DATA.rf_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
                BIND_DATA.rf_power = parseInt($('input[name="rf_power"]').val());
                BIND_DATA.rf_channel_spacing = parseInt($('input[name="channel_spacing"]').val());
                BIND_DATA.serial_baudrate = parseInt($('select[name="serial_baudrate"]').val());
                BIND_DATA.modem_params = parseInt($('select[name="data_rate"]').val());
                
                // combine flags value
                var temp_flags = parseInt($('select[name="channel_config"]').val());
                
                if (parseInt($('select[name="telemetry"]').val()) == 1) {
                    temp_flags |= 0x08;
                } else if (parseInt($('select[name="telemetry"]').val()) == 2) {
                    temp_flags |= 0x18; // (0x08 for telmetry + 0x10 for frsky
                }
                
                // store new flags in BIND_DATA object
                BIND_DATA.flags = temp_flags;
                
                // Advanced settings
                BIND_DATA.rf_magic = getRandomInt(116548, 4294967295); // rf_magic is randomized every time settings are saved
                
                send_TX_config();
            } else {
                command_log('One or more fields didn\'t pass the validation process, they should be highligted with <span style="color: red">red</span> border');
                command_log('Please try to enter appropriate value, otherwise you <span style="color: red">won\'t</span> be able to save settings in EEPROM');
            }
        });
    });
}

function randomize_hopchannels() {    
    // every time hop count is changed, hopchannel array will be reinitialized with new random values
    BIND_DATA.hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
    
    // get number of hops from the input field and also apply min and max limit
    var number_of_hops = parseInt($('input[name="hopcount"]').val());
    if (number_of_hops >= parseInt($('input[name="hopcount"]').prop('min')) && number_of_hops <= parseInt($('input[name="hopcount"]').prop('max'))) {
        // all is valid
        $('input[name="hopcount"]').removeClass('validation_failed');
    } else {
        // failed
        $('input[name="hopcount"]').addClass('validation_failed');
        
        number_of_hops = 1;
    }
    
    var maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000);
    var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
    var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
    
    // find channel limit
    var approximation = 0;
    var maximum_desired_channel = 0;
    while (approximation < maximum_desired_frequency) {
        maximum_desired_channel++; // starting at 1
        approximation = (base_fequency + maximum_desired_channel * channel_spacing * 10000);
        
        // we dont need to check above maximum
        if (maximum_desired_channel >= 255) {
            break;
        }
    } 
    
    // fill hopchannel array with desired number of hops    
    var i = 0;
    var emergency_counter = 0;
    while (i < number_of_hops) {
        var random_number = getRandomInt(1, maximum_desired_channel);
        
        // check if value is unique (don't allow same channels)
        if (BIND_DATA.hopchannel.indexOf(random_number) == -1) {
            BIND_DATA.hopchannel[i++] = random_number;
        }
        
        emergency_counter++;
        if (emergency_counter > 1000) {
            // 1000 itterations and no suitable channel found, breaking
            break;
        }
    }
    
    // refresh info view
    generate_info_list();    
}

function generate_info_list() {
    var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
    var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
    
    $('div.hop_channels ul.list').empty(); // delete previous list

   
    // List actual hop frequencies (base frequency + hopchannel * channel spacing * 10kHz = actual channel frequency)
    var list = 0;
    max_frequency = 0;
    var hopcount = parseInt($('input[name="hopcount"]').val());
    if (hopcount >= parseInt($('input[name="hopcount"]').prop('min')) && hopcount <= parseInt($('input[name="hopcount"]').prop('max'))) {
        // all is valid
    } else {
        hopcount = 1;
    }
    
    for (var i = 0; i < hopcount; i++) {
        var output = (base_fequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz
        
        if (BIND_DATA.hopchannel[i] != 0) {
            $('div.hop_channels ul.list').eq(list).append('<li><input class="hopchan" name="hopchan" type="number" min="1" max="' + hopcount + '" value="' + (i + 1) + '"/></li>');
            $('div.hop_channels ul.list li').last().append('<input class="chan_value" name="chan_value" type="number" step="' + (channel_spacing * 10) + '" value="' + output + '"/> kHz');
            //$('div.hop_channels ul.list').eq(list).append("<li> Hop " + (i + 1) + " - " + output + " kHz</li>");
            
            // save hopchannel index in data for later comparison
            //$('div.hop_channels ul.list').eq(list).find('input').last().data('oldVal', (i + 1));
        } else {
            // we dropped here because hopchannel for this hop couldn't be generated (desired frequency range is too small)
            // all of the failed chanells will be visually marked as red
            $('div.hop_channels ul.list').eq(list).append('<li style="color: red"> Hop ' + (i + 1) + ' - ' + output + ' kHz</li>');
        }
        
        // switch lists if necessary
        if (i == 4 || i == 9 || i == 14 || i == 19) {
            list++;
        }
        
        // check the frequency
        if (max_frequency < output) {
            max_frequency = output;
        }
    }
    
    // Update Max Frequency
    $('.maximum_frequency').html(max_frequency + ' kHz');
    
    // bind UI hooks for newly generated list
    $('div.hop_channels ul.list input').change(function() {
        custom_hopchannel_list_valid = false;
        
        // 1. bound validation
        var bound_validation = true;
        $('div.hop_channels ul.list input.hopchan').each(function() {
            if (!validate_input_bounds($(this))) {
                bound_validation = false;
            }
        });
        
        // 2. index validation
        if (bound_validation) {
            var index_validation = true;
            
            var temp_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
            
            $('div.hop_channels ul.list input.hopchan').each(function() {
                var index = parseInt($(this).val());
                if (temp_array.indexOf(index) == -1) {
                    // index is not yet in the array, save it
                    temp_array[index] = index;
                    
                    $(this).removeClass('validation_failed');
                } else {
                    // index is already in array, failed
                    index_validation = false;
                    
                    $(this).addClass('validation_failed');
                }
            });
        }
        
        // 3. chanvalue validation
        if (index_validation) {
            var chanvalue_validation = true;
            
            // generate helper array
            var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
            var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
            var maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000);
            var valid_freq = new Array();
            var new_hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
            
            for (var i = 0; i < 256; i++) { // starting at first channel
                var output = (base_fequency + i * channel_spacing * 10000) / 1000; // kHz
                
                if (output > (maximum_desired_frequency / 1000)) {
                    // break on hitting the maximum frequency desired by the user
                    break;
                }
                
                valid_freq.push(output);
            }
            
            $('div.hop_channels ul.list input.chan_value').each(function() {
                var val = parseInt($(this).val());
                var index = parseInt($(this).parent().find('input.hopchan').val()) - 1; // input channels start with 1, but array starts with 0
                
                var match_found = false;
                for (var i = 0; i < valid_freq.length; i++) {
                    if (valid_freq[i] == val) {
                        match_found = true;
                        
                        new_hopchannel[index] = i;
                        
                        $(this).removeClass('validation_failed');
                        break;
                    }
                }
                
                if (!match_found) {
                    chanvalue_validation = false;
                    
                    $(this).addClass('validation_failed');
                }
            });
        }
        
        // 4. value duplicity validation
        if (chanvalue_validation) {
            var channel_duplicity_validation = true;
            
            var temp_array = new Array();
            
            $('div.hop_channels ul.list input.chan_value').each(function() {
                var val = parseInt($(this).val());

                for (var i = 0; i < temp_array.length; i++) {
                    if (temp_array[i] == val) {
                        // match found, failed
                        channel_duplicity_validation = false;
                        
                        $(this).addClass('validation_failed');
                        
                        break;
                    }
                }
                
                if (channel_duplicity_validation) {
                    temp_array.push(val);
                    $(this).removeClass('validation_failed');
                }
            });
        }
        
        // all is good, replace arrays
        if (channel_duplicity_validation) {
            BIND_DATA.hopchannel = new_hopchannel;
            
            custom_hopchannel_list_valid = true;
        }
    });
}

function generate_info_refresh() {
    var data_rates = new Array(4800, 9600, 19200);
    var packet_sizes = new Array(7, 11, 12, 16, 17, 21);
    
    var ms = ((packet_sizes[parseInt($('select[name="channel_config"]').val()) - 1] + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())] + 2000;
    
    var telemetry = parseInt($('select[name="telemetry"]').val());
    if (telemetry == 1 || telemetry == 2) {
        ms += (((9 + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())]) + 1000;
    }
    
    ms = ((ms + 999) / 1000) * 1000;
    
    $('.packet_interval').html(ms.toFixed(0) + ' &#181;s');
    $('.refresh_rate').html((1000000 / ms).toFixed(0) + ' Hz');
}
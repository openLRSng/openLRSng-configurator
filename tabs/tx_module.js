function tab_initialize_tx_module() {
    ga_tracker.sendAppView('TX Module');
    
    var generate_info = function() {
        var data_rates = new Array(4800, 9600, 19200, 57600, 125000);
        var packet_sizes = new Array(7, 11, 12, 16, 17, 21);
        
        var ms = ((packet_sizes[parseInt($('select[name="channel_config"]').val()) - 1] + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())] + 2000;
        
        if (parseInt($('select[name="telemetry"]').val()) >= 1) {
            ms += (((9 + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())]) + 1000;
        }
        
        ms = ((ms + 999) / 1000) * 1000;
        
        $('.packet_interval').html(ms.toFixed(0) + ' &#181;s');
        $('.refresh_rate').html((1000000 / ms).toFixed(0) + ' Hz');
    };
    
    var max_frequency;
    var generate_hop_channels_list = function() {
        // List actual hop frequencies (base frequency + hopchannel * channel spacing * 10kHz = actual channel frequency)
        var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
        var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
        var hopcount = parseInt($('input[name="hopcount"]').val());
        
        max_frequency = 0; // reset variable
        $('div.hop_channels .list').empty(); // delete previous list
        
        if (hopcount >= parseInt($('input[name="hopcount"]').prop('min')) && hopcount <= parseInt($('input[name="hopcount"]').prop('max'))) {
            // all is valid
        } else {
            hopcount = 1;
        }
        
        for (var i = 0; i < hopcount; i++) {
            var output = (base_fequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz
            
            $('div.hop_channels .list').append('<input class="chan_value" name="chan_value" type="number" title="Hop ' + (i + 1) + ' - ' + output + ' kHz" value="' + output + '"/>');

            // store current value of output in data object inside the element
            $('div.hop_channels .list input.chan_value:last').data("value", output);
            
            if (BIND_DATA.hopchannel[i] == 0) {
                // hopchannel for this hop couldn't be generated (desired frequency range is too small), all of the failed chanells will be visually marked as red
                $('div.hop_channels .list input.chan_value:last').addClass('validation_failed');
            }

            // check the frequency
            if (max_frequency < output) {
                max_frequency = output;
            }
        }
        
        // Update Max Frequency
        $('.maximum_frequency').html(max_frequency + ' kHz');
        
        // bind UI hooks for newly generated list
        $('div.hop_channels .list input').change(function() {
            // Under the hood "step" emulation
            // We are using custom this "step" approach because we can't use steps of channel_spacing * 10 without proper context
            // if user would select frequency which doesn't end with 0, all of the "changes" would fail because, even step would break
            // the current value, for example: freq of 435001 with spacing of 5 * 10, would result in 435050, when we desire 435051.
            var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
            
            if (parseInt($(this).val()) > $(this).data("value")) {
                // current value is bigger then old value, jump to next channel
                $(this).val($(this).data("value") + (channel_spacing * 10));
            } else if (parseInt($(this).val()) < $(this).data("value")) {
                // current value is smaller then old value, jump to previous channel
                $(this).val($(this).data("value") - (channel_spacing * 10));
            }
            
            // update title with latest value
            $(this).prop('title', 'Hop ' + ($(this).index() + 1) + ' - ' + $(this).val() + ' kHz');
            
            // update data object with latest value for next comparison
            $(this).data("value", parseInt($(this).val()));
            
            // validation        
            custom_hopchannel_list_valid = false;
            
            // 1. bound validation
            var bound_validation = true;
            $('div.hop_channels .list input.hopchan').each(function() {
                if (!validate_input_bounds($(this))) {
                    bound_validation = false;
                }
            });
            
            // 2. index validation
            if (bound_validation) {
                var index_validation = true;
                
                var temp_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
                
                $('div.hop_channels .list input.hopchan').each(function() {
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
                
                var index = 0;
                $('div.hop_channels .list input.chan_value').each(function() {
                    var val = parseInt($(this).val());
                    
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
                    
                    index++;
                });
            }
            
            // 4. value duplicity validation
            if (chanvalue_validation) {
                var channel_duplicity_validation = true;
                
                var temp_array = new Array();
                
                $('div.hop_channels .list input.chan_value').each(function() {
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
    };
    
    var randomize_hopchannels = function() {
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
        generate_hop_channels_list();
    };
    
    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function() {
        GUI.active_tab = 'tx_module';
        
        // Basic settings
        
        // profile
        $('select[name="profile"]').val(activeProfile);
        $('select[name="profile"]').change(function() {
            var profile = parseInt($(this).val());
            
            GUI.log('Requesting Profile: <strong>' + (profile + 1) + '</strong>');
            
            send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function() {
                // profile switched on the MCU side, pull data corresponding to this profile
                activeProfile = profile; // we don't need to request activeProfile as we know the value already
                
                send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                    // new data received, re-initialize values in current tab
                    tab_initialize_tx_module();
                });
            });
        });
        
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
        }).change(); // fire change event manually        
        
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000); // parsing from HZ to kHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
        $('select[name="serial_baudrate"]').val(BIND_DATA.serial_baudrate);
        $('select[name="data_rate"]').val(BIND_DATA.modem_params);
        
        if (bit_check(BIND_DATA.flags, 3)) {
            // telemetry ON
            $('select[name="telemetry"]').val(1);
        }
        
        if (bit_check(BIND_DATA.flags, 4)) {
            // telemetry FRSKY
            $('select[name="telemetry"]').val(2);
        }
        
        if (bit_check(BIND_DATA.flags, 3) && bit_check(BIND_DATA.flags, 4)) {
            // telemetry smartPort
            $('select[name="telemetry"]').val(3);
        }
        
        if (bit_check(BIND_DATA.flags, 6)) {
            // inverted PPM in
            $('input.ppm_in_inverted').prop('checked', true);
        }
        
        if (bit_check(BIND_DATA.flags, 7)) {
            // Micro PPM in
            $('input.ppm_in_micro').prop('checked', true);
        }
        
        if (bit_check(BIND_DATA.flags, 5)) {
            // mute buzzer
            $('select[name="silent_buzzer"]').val(1);
        }
        
        // ignore flipped bits 3-7 (this needs to be increased in case flag size changes from 8 bits to something bigger)
        $('select[name="channel_config"]').val(BIND_DATA.flags & ~0xF8);

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
        generate_info();
        generate_hop_channels_list();
        
        $('input[name="maximum_desired_frequency"]').val(max_frequency); // setting this input after max_frequency was created
        $('span.bind_code').html(BIND_DATA.rf_magic.toString(16).toUpperCase());
        
        // UI hooks
        $('a.clone_profile').click(function() {
            //var current_profile = parseInt($('select[name="profile"]').val());
            var profiles_saved = 0;
            
            var save_profile = function(profile) {
                GUI.log('Selecting Profile: <strong>' + (profile + 1) + '</strong>');
                
                send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function() {
                    send_TX_config(function() {
                        if (profiles_saved < 4) {
                            save_profile(profiles_saved++);
                        }
                    });
                });
            };
            
            if (validate_and_save_to_eeprom(false)) {
                save_profile(profiles_saved++);
            }
        });
        
        $('select[name="data_rate"], select[name="telemetry"], select[name="channel_config"]').change(function() {
            generate_info();
        });
        
        $('input[name="operating_frequency"], input[name="channel_spacing"]').change(function() {
            generate_hop_channels_list();
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
        
        // restore from file
        $('a.restore_from_file').click(function() {
            restore_from_file('TX_configuration_backup', function(profiles) {
                var current_profile = activeProfile;
                var saving_profile = 0;
                
                if (profiles.length > 1) {
                    // restore all profiles
                    var save_data_loop = function() {
                        GUI.log('Uploading Profile: <strong>' + (saving_profile + 1) + '</strong>');
                        
                        send_message(PSP.PSP_SET_ACTIVE_PROFILE, saving_profile, false, function() {
                            BIND_DATA = profiles[saving_profile++];
                            
                            send_TX_config(function() {
                                if (saving_profile < 4) {
                                    save_data_loop();
                                } else {
                                    send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile, false, function() {
                                        // we need to refresh UI with latest values that came from the backup file
                                        send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                                            GUI.log('Configuration <span style="color: green">successfully</span> restored from file');
                                            // new data received, re-initialize values in current tab
                                            tab_initialize_tx_module();
                                        });
                                    });
                                }
                            });
                        });
                    };
                    
                    save_data_loop();
                } else {
                    // restore single profile
                    GUI.log('Uploading Profile: <strong>' + (current_profile + 1) + '</strong>');
                    
                    BIND_DATA = profiles[0];
                    
                    send_TX_config(function() {
                        // we need to refresh UI with latest values that came from the backup file
                        send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                            GUI.log('Configuration <span style="color: green">successfully</span> restored from file');
                            // new data received, re-initialize values in current tab
                            tab_initialize_tx_module();
                        });
                    });
                    
                }
            });
        });
        
        // backup single (this) profile
        $('a.backup_single_profile').click(function() {
            var profile_array = [];
            profile_array.push($.extend(true, {}, BIND_DATA)); // make a deep copy
            
            save_object_to_file(profile_array, 'TX_single_profile_backup', function(result) {
                GUI.log('Configuration was saved <span style="color: green">successfully</span>');
            });
        });
        
        // backup all profiles
        $('a.backup_all_profiles').click(function() {
            var current_profile = activeProfile;
            var getting_profile = 0;
            var profile_array = [];
            
            var get_data_loop = function() {
                GUI.log('Requesting Profile: <strong>' + (getting_profile + 1) + '</strong>');
                
                send_message(PSP.PSP_SET_ACTIVE_PROFILE, getting_profile, false, function() {
                    send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                        var temp_obj = $.extend(true, {}, BIND_DATA); // make a deep copy
                        profile_array.push(temp_obj);
                        
                        getting_profile++;
                        
                        if (getting_profile < 4) {
                            get_data_loop();
                        } else {
                            // we have all profiles, reset to previous state
                            send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile, false, function() {
                            });
                            
                            save_object_to_file(profile_array, 'TX_all_profiles_backup', function(result) {
                                GUI.log('Configuration was saved <span style="color: green">successfully</span>');
                            });
                        }
                    });
                });
            };
            
            get_data_loop();
        });
        
        // restore to default
        $('a.restore_default').click(function() {
            send_message(PSP.PSP_SET_TX_RESTORE_DEFAULT, false, false, function() {
                // request restored configuration
                send_message(PSP.PSP_REQ_ACTIVE_PROFILE, false, false, function() {
                    send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                        tab_initialize_tx_module();
                    });
                });
            });
        });
        
        // save to eeprom
        $('a.save_to_eeprom').click(function() {
            validate_and_save_to_eeprom(true);
        });
        
        var validate_and_save_to_eeprom = function(use_random_rf_magic) {
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
            $('div.hop_channels .list input:first').change();
            
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
                    // telemetry ON
                    temp_flags |= 0x08;
                } else if (parseInt($('select[name="telemetry"]').val()) == 2) {
                    // telemetry FRSKY
                    temp_flags |= 0x10;
                } else if (parseInt($('select[name="telemetry"]').val()) == 3) {
                    // telemetry smartPort
                    temp_flags |= 0x18;
                }
                
                if ($('input.ppm_in_inverted').prop('checked')) {
                    // PPM in inverted
                    temp_flags |= 0x40;
                }
                
                if ($('input.ppm_in_micro').prop('checked')) {
                    // Micro PPM in
                    temp_flags |= 0x80;
                }
                
                if (parseInt($('select[name="silent_buzzer"]').val()) == 1) {
                    // mute buzzer
                    temp_flags |= 0x20;
                }
                
                // store new flags in BIND_DATA object
                BIND_DATA.flags = temp_flags;
                
                // Advanced settings
                // rf_magic is randomized every time settings are saved
                // rf_magic randomization is disabled while cloning profiles
                if (use_random_rf_magic) BIND_DATA.rf_magic = getRandomInt(116548, 4294967295);
                $('span.bind_code').html(BIND_DATA.rf_magic.toString(16).toUpperCase());
                
                send_TX_config();
                
                return true;
            } else {
                GUI.log('One or more fields didn\'t pass the validation process, they should be highligted with <span style="color: red">red</span> border');
                GUI.log('Please try to enter appropriate value, otherwise you <span style="color: red">won\'t</span> be able to save settings in EEPROM');
                
                return false;
            }
        };
    });
}
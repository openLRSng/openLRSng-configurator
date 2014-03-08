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
    
    var min_frequency
    var max_frequency;
    var max_used_frequency;
    var custom_hopchannel_list_valid;
    var new_hopchannel_array;
    var generate_hop_channels_list = function(update_maximum_desired_frequency) {
        // List actual hop frequencies (base frequency + hopchannel * channel spacing * 10kHz = actual channel frequency)
        var base_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
        var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
        var hopcount = parseInt($('input[name="hopcount"]').val());
        
        // reset variables
        max_used_frequency = 0;
        
        min_frequency = (base_frequency + 1 * channel_spacing * 10000) / 1000; // channel 1
        $('div.hop_channels .list').empty(); // delete previous list
        
        for (var i = 0; i < hopcount; i++) {
            var output = (base_frequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz
            
            $('div.hop_channels .list').append('<input class="chan_value" name="chan_value" type="number" \
                title="Hop ' + (i + 1) + ' - Channel ' + BIND_DATA.hopchannel[i] + ' - ' + output + ' kHz" \
                min="' + min_frequency + '" max="TBD" step="' + (channel_spacing * 10) + '" \
                value="' + output + '"/>');
            if (BIND_DATA.hopchannel[i] == 0) {
                // hopchannel for this hop couldn't be generated (desired frequency range is too small), all of the failed chanells will be visually marked as red
                $('div.hop_channels .list input.chan_value:last').addClass('validation_failed');
            }
            
            // check maximum used frequency
            if (max_used_frequency < output) {
                max_used_frequency = output;
            }
        }
        
        // Update Max Used Frequency
        $('.maximum_frequency').html(max_used_frequency + ' kHz');
        
        // Update max_desired_frequency
        if (update_maximum_desired_frequency) {
            // we are also adding one more extra channel so we wouldn't trigger desired_freq_limit
            $('input[name="maximum_desired_frequency"]').val(max_used_frequency + (channel_spacing * 10));
        }
        
        // generate valid frequency array (required for "proper" max_frequency)
        var maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000);
        var valid_frequency_array = new Array();
        for (var i = 1; i < 256; i++) { // starting at first channel
            var output = (base_frequency + i * channel_spacing * 10000) / 1000; // kHz
            
            if (output > (maximum_desired_frequency / 1000)) {
                // break on hitting the maximum frequency desired by the user
                break;
            }
            
            valid_frequency_array.push(output);
        }
        
        max_frequency = Math.max.apply(null, valid_frequency_array); // highest channel
        $('div.hop_channels .list input').prop('max', max_frequency); // update all input fields with highest possible value
        
        
        // bind UI hooks for newly generated list
        $('div.hop_channels .list input').change(function() {
            var self = this;
            
            setTimeout(function() {
                // update title with latest value
                var channel = (parseInt($(self).val()) - parseInt($('input[name="operating_frequency"]').val())) / parseInt($(self).prop('step'));
                $(self).prop('title', 'Hop ' + ($(self).index() + 1) + ' - Channel ' + channel + ' - ' + $(self).val() + ' kHz');
                
                // Validation        
                custom_hopchannel_list_valid = false;
                
                // 1. chanel value validation
                var chanvalue_validation = true;
                
                var base_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
                var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
                var maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000);
                
                // generate valid frequency array
                var valid_frequency_array = new Array();
                for (var i = 1; i < 256; i++) { // starting at first channel
                    var output = (base_frequency + i * channel_spacing * 10000) / 1000; // kHz
                    
                    if (output > (maximum_desired_frequency / 1000)) {
                        // break on hitting the maximum frequency desired by the user
                        break;
                    }
                    
                    valid_frequency_array.push(output);
                }
                
                // generate new hopchannel array while validating the frequency against valid frequency array
                new_hopchannel_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
                $('div.hop_channels .list input.chan_value').each(function() {
                    var val = parseInt($(this).val());
                    var index = $(this).index();
                    
                    if (valid_frequency_array.indexOf(val) != -1) {
                        // valid
                        new_hopchannel_array[index] = (parseInt($(this).val()) - parseInt($('input[name="operating_frequency"]').val())) / parseInt($(this).prop('step'));
                        
                        $(this).removeClass('validation_failed');
                    } else {
                        // invalid
                        $(this).addClass('validation_failed');
                        chanvalue_validation = false;
                    }
                });
                
                // 2. value duplicity validation
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
                    custom_hopchannel_list_valid = true;
                }
            }, 0); // race condition, that should always trigger after all events are processed
        });
    };
    
    var randomize_hopchannels = function() {
        // every time hop count is changed, hopchannel array will be reinitialized with new random values
        BIND_DATA.hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
        
        var number_of_hops = parseInt($('input[name="hopcount"]').val());
        var maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000);
        var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
        var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
        
        // find channel limit
        var maximum_desired_channel = 0;
        for (var i = 0; i < 256; i++) { // 255 = maximum
            maximum_desired_channel++; // starting at 1
            var real_frequency = (base_fequency + maximum_desired_channel * channel_spacing * 10000);
            
            if (real_frequency > maximum_desired_frequency) {
                // we went overboard, correct desired channel and break
                maximum_desired_channel--;
                break;
            }
        }
        
        // announce limit
        if (debug) console.log('HopChannel limit set to: ' + maximum_desired_channel);
        
        // generate randomization array
        var randomization_array = [];
        for (var i = 1; i < maximum_desired_channel; i++) {
            randomization_array.push(i);
        }
        
        // fill hopchannel array with desired number of hops
        if (randomization_array.length) { // only execute if there are channels to assign
            for (var i = 0; i < number_of_hops; i++) {
                var random_number = getRandomInt(0, randomization_array.length - 1);            
                BIND_DATA.hopchannel[i] = randomization_array[random_number];
                
                // remove selected channel from randomization array
                randomization_array.splice(random_number, 1);
                
                // if we used up all possible channels, break
                if (randomization_array.length == 0) {
                    break;
                }
            }
        }

        // refresh info view
        generate_hop_channels_list();
    };
    
    var validate_and_save_to_eeprom = function(use_random_rf_magic, callback) {        
        // fire change event on hop_channel list elemets to run custom_hop_list validation
        $('div.hop_channels .list input:first').change();
        
        // let all events bubble up
        setTimeout(function() {
            if (custom_hopchannel_list_valid) {
                BIND_DATA.hopchannel = new_hopchannel_array; // update hopchannel with current "custom" hopchannel array
                
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
                $('input.bind_code').val(BIND_DATA.rf_magic.toString(16).toUpperCase()); // TODO
                
                send_TX_config();
                
                if (callback) callback(true);
            } else {
                GUI.log('One or more fields didn\'t pass the validation process, they should be highligted with <span style="color: red">red</span> border');
                GUI.log('Please try to enter appropriate value, otherwise you <span style="color: red">won\'t</span> be able to save settings in EEPROM');
                
                if (callback) callback(false);
            }
        }, 0); // race condition, that should always trigger after all events are processed
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
            
            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function() {
                // profile switched on the MCU side, pull data corresponding to this profile
                activeProfile = profile; // we don't need to request activeProfile as we know the value already
                
                PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
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
        generate_hop_channels_list(true); // true triggers update for maximum_desired_frequency (only initial update)
        
        $('input.bind_code').val(BIND_DATA.rf_magic.toString(16).toUpperCase());
        
        // lock / unlock checkbox + input for bind_code according to saved data
        chrome.storage.local.get('manual_bind_code', function(result) {
            if (typeof result.manual_bind_code !== 'undefined') {
                if (result.manual_bind_code) {
                    $('input.bind_code').prop('disabled', false);
                    $('input.automatic_bind_code').prop('checked', false);
                } else {
                    $('input.bind_code').prop('disabled', true);
                    $('input.automatic_bind_code').prop('checked', true);
                }                
            } else {
                // wasn't saved yet, default settings will be kept (automatic random bind code enabled)
            }
            
            // bind UI hooks for the checkbox
            $('input.automatic_bind_code').change(function() {
                var state;
                if ($(this).is(':checked')) {
                    state = false;
                    $('input.bind_code').prop('disabled', true);
                } else {
                    state = true;
                    $('input.bind_code').prop('disabled', false);
                }
                
                chrome.storage.local.set({'manual_bind_code': state}, function() {});
            });
        });
        
        // UI hooks
        $('a.clone_profile').click(function() {
            var profiles_saved = 0;
            
            var save_profile = function(profile) {
                GUI.log('Selecting Profile: <strong>' + (profile + 1) + '</strong>');
                
                PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function() {
                    send_TX_config(function() {
                        if (profiles_saved < 4) {
                            save_profile(profiles_saved++);
                        }
                    });
                });
            };
            
            validate_and_save_to_eeprom(false, function(result) {
                if (result) save_profile(profiles_saved++);
            });
        });
        
        $('select[name="data_rate"], select[name="telemetry"], select[name="channel_config"]').change(function() {
            if ($(this).prop('name') == 'data_rate' && parseInt($(this).val()) == 4) {
                // set channel spacing of 25 while using 115k data rate (also fire change event)
                $('input[name="channel_spacing"]').val(25).change();
            }
            
            generate_info();
        });
        
        $('input[name="channel_spacing"]').change(function() {
            if (parseInt($('select[name="data_rate"]').val()) == 4 && parseInt($(this).val()) < 25) {
                // enforce channel spacing of 25 while using 115k data rate (no change event fired)
                $(this).val(25);
            } else {
                // race condition, that should always trigger after all events are processed
                setTimeout(function() {
                    generate_hop_channels_list();
                    $('div.hop_channels .list input:first').change(); // run validation
                }, 0);
            }
        });
        
        $('input[name="operating_frequency"], input[name="hopcount"]').change(function() {
            // race condition, that should always trigger after all events are processed
            setTimeout(function() {
                randomize_hopchannels();
            }, 0);
        });
        
        $('a.randomize').click(function() {
            randomize_hopchannels();
        });
        
        $('input[name="maximum_desired_frequency"]').change(function() {
            // race condition, that should always trigger after all events are processed
            setTimeout(function() {
                randomize_hopchannels();
            }, 0);
        });
        
        // restore from file
        $('a.restore_from_file').click(function() {
            restore_from_file(function(result) {
                // validate object properties and object lengths
                var valid = true;
                
                outter_loop:
                for (var property in BIND_DATA) {
                    for (var i = 0; i < result.obj.length; i++) {
                        if (!result.obj[i].hasOwnProperty(property)) {
                            valid = false;
                            break outter_loop;
                        }
                    }
                }
                
                for (var i = 0; i < result.obj.length; i++) {
                    if (Object.keys(BIND_DATA).length != Object.keys(result.obj[i]).length) {
                        valid = false;
                        break;
                    }
                }
                
                if ((result.type == 'TX_single_profile_backup' || result.type == 'TX_all_profiles_backup') && valid) {
                    var current_profile = activeProfile;
                    var saving_profile = 0;
                    var profiles = result.obj;
                    
                    if (profiles.length > 1) {
                        // restore all profiles
                        var save_data_loop = function() {
                            GUI.log('Uploading Profile: <strong>' + (saving_profile + 1) + '</strong>');
                            
                            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, saving_profile, false, function() {
                                BIND_DATA = profiles[saving_profile++];
                                
                                send_TX_config(function() {
                                    if (saving_profile < 4) {
                                        save_data_loop();
                                    } else {
                                        PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile, false, function() {
                                            // we need to refresh UI with latest values that came from the backup file
                                            PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
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
                            PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                                GUI.log('Configuration <span style="color: green">successfully</span> restored from file');
                                // new data received, re-initialize values in current tab
                                tab_initialize_tx_module();
                            });
                        });
                        
                    }
                } else {
                    GUI.log('<span style="color: red">Incorrect / Corrupted</span> data structure detected');
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
                
                PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, getting_profile, false, function() {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                        var temp_obj = $.extend(true, {}, BIND_DATA); // make a deep copy
                        profile_array.push(temp_obj);
                        
                        getting_profile++;
                        
                        if (getting_profile < 4) {
                            get_data_loop();
                        } else {
                            // we have all profiles, reset to previous state
                            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile);
                            
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
            PSP.send_message(PSP.PSP_SET_TX_RESTORE_DEFAULT, false, false, function() {
                // request restored configuration
                PSP.send_message(PSP.PSP_REQ_ACTIVE_PROFILE, false, false, function() {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function() {
                        tab_initialize_tx_module();
                    });
                });
            });
        });
        
        // save to eeprom
        $('a.save_to_eeprom').click(function() {
            if ($('input.automatic_bind_code').is(':checked')) {
                // automatic bind code
                validate_and_save_to_eeprom(true);
            } else {
                // manual bind code
                BIND_DATA.rf_magic = parseInt($('input.bind_code').val(), 16);
                validate_and_save_to_eeprom(false);
            }
        });
    });
}
function tab_initialize_tx_module() {
    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function() {
        // Basic settings
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000); // parsing from HZ to kHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
        $('select[name="data_rate"]').val(BIND_DATA.modem_params);
        
        if (bit_check(BIND_DATA.flags, 3)) {
            $('select[name="telemetry"]').val(1);
        } else {
            $('select[name="telemetry"]').val(0);
        }
        
        // first we will remove the telemetry bit (doesn't matter if its high or low at this point)
        var rc_channel_config = bit_clear(BIND_DATA.flags, 3);
        $('select[name="channel_config"]').val(rc_channel_config);

        // Advanced settings
        $('input[name="rf_magic"]').val(BIND_DATA.rf_magic.toString(16).toUpperCase());
        
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
        
        $('a.randomize').click(function() {
            var random_int = getRandomInt(116548, 4294967295);
            $('input[name="rf_magic"]').val(random_int.toString(16).toUpperCase());
        });
        
        $('input[name="hopcount"]').change(function() {
            randomize_hopchannels();
        });
        
        $('a.randomize2').click(function() {
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
            // Basic settings
            // we need to "grasp" all values from the UI, store it in the local BIND_DATA object
            // send this object to the module and then request EEPROM save
            BIND_DATA.rf_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
            BIND_DATA.rf_power = parseInt($('input[name="rf_power"]').val());
            BIND_DATA.rf_channel_spacing = parseInt($('input[name="channel_spacing"]').val());
            BIND_DATA.modem_params = parseInt($('select[name="data_rate"]').val());
            
            // combine flags value
            var temp_flags = parseInt($('select[name="channel_config"]').val());
            
            if (parseInt($('select[name="telemetry"]').val()) == 1) {
                temp_flags |= 0x08;
            }
            
            // store new flags in BIND_DATA object
            BIND_DATA.flags = temp_flags;
            
            // Advanced settings
            BIND_DATA.rf_magic = parseInt($('input[name="rf_magic"]').val().toLowerCase(), 16);
            
            send_TX_config();
        });
    });
}

function randomize_hopchannels() {    
    // every time hop count is changed, hopchannel array will be reinitialized with new random values
    BIND_DATA.hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
    
    var number_of_hops = parseInt($('input[name="hopcount"]').val());
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
    for (var i = 0; i < hopcount; i++) {
        var out = (base_fequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz
        
        if (BIND_DATA.hopchannel[i] != 0) {
            //$('div.hop_channels ul.list').eq(list).append("<li> Hop <input name=\"hopchan\" type=\"number\" min=\"1\" max=\"" + hopcount + "\" value=\"" + (i + 1) + "\"/> - " + out + " kHz</li>");
            $('div.hop_channels ul.list').eq(list).append("<li> Hop " + (i + 1) + " - " + out + " kHz</li>");
            
            // save hopchannel index in data for later comparison
            //$('div.hop_channels ul.list').eq(list).find('input').last().data('oldVal', (i + 1));
        } else {
            // we dropped here because hopchannel for this hop couldn't be generated (desired frequency range is too small)
            // all of the failed chanells will be visually marked as red
            $('div.hop_channels ul.list').eq(list).append("<li style=\"color: red;\"> Hop " + (i + 1) + " - " + out + " kHz</li>");
        }
        
        // switch lists if necessary
        if (i == 4 || i == 9 || i == 14 || i == 19) {
            list++;
        }
        
        // check the frequency
        if (max_frequency < out) {
            max_frequency = out;
        }
    }
    
    // Update Max Frequency
    $('.maximum_frequency').html(max_frequency + ' kHz');
    
    /*
    // bind UI hooks for newly generated list
    $('div.hop_channels ul.list input').change(function() {
        var old_index = $(this).data('oldVal') - 1;
        var new_index = parseInt($(this).val()) - 1;
        
        var old_value = BIND_DATA.hopchannel[old_index];
        var new_value = BIND_DATA.hopchannel[new_index];
        
        // swap
        BIND_DATA.hopchannel[old_index] = new_value;
        BIND_DATA.hopchannel[new_index] = old_value;
        
        // re-generate info list
        generate_info_list();
    });
    */
}

function generate_info_refresh() {
    var data_rates = new Array(4800, 9600, 19200);
    var packet_sizes = new Array(7, 11, 12, 16, 17, 21);
    
    var ms = ((packet_sizes[parseInt($('select[name="channel_config"]').val()) - 1] + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())] + 2000;
    
    if (parseInt($('select[name="telemetry"]').val()) == 1) {
        ms += (((9 + 15) * 8200000) / data_rates[parseInt($('select[name="data_rate"]').val())]) + 1000;
    }
    
    ms = ((ms + 999) / 1000) * 1000;
    
    $('.packet_interval').html(ms.toFixed(0) + ' &#181;s');
    $('.refresh_rate').html((1000000 / ms).toFixed(0) + ' Hz');
}
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
        $('input[name="hopcount"]').val(BIND_DATA.hopcount);
        
        // Info / Hop Channels
        generate_info_refresh();
        generate_info_list();
        
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
            // every time hop count is changed, hopchannel array will be reinitialized with new random values
            BIND_DATA.hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
            
            var number_of_hops = parseInt($('input[name="hopcount"]').val());
            
            var i = 0;
            while (i <= number_of_hops) {
                var random_number = getRandomInt(1, 255);
                
                // check if value is unique (don't allow same channels)
                if (BIND_DATA.hopchannel.indexOf(random_number) == -1) {
                    BIND_DATA.hopchannel[i++] = random_number;
                }
            }
            
            // refresh info view
            generate_info_list();
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
            BIND_DATA.hopcount = parseInt($('input[name="hopcount"]').val());
            
            send_TX_config();
        });
    });
}

function generate_info_list() {
    var base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
    var channel_spacing = parseInt($('input[name="channel_spacing"]').val());
    
    $('div.hop_channels ul.list').empty(); // delete previous list

   
    // List actual hop frequencies (base frequency + hopchannel * channel spacing * 10kHz = actual channel frequency)
    var list = 0;
    var max_frequency = 0;
    for (var i = 0; i < parseInt($('input[name="hopcount"]').val()); i++) {
        var out = (base_fequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz
        $('div.hop_channels ul.list').eq(list).append("<li> Hop " + (i + 1) + " - " + out + " kHz</li>");
        
        // switch lists in necessary
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
function tab_initialize_tx_module() {
    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function() {
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000000); // parsing from HZ to MHz
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

        // UI hooks
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
        
        });
    });
}
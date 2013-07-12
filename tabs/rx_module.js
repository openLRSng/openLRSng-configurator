function tab_initialize_rx_module() {    
    if (connected_to_RX != 1) {
        $('#content').html('Please <strong>wait</strong> for the transmitter to establish connection with receiver module. <br />\
        Receiver always binds on bootup for <strong>0.5s</strong>, if this fails try <strong>bridging</strong> CH1-CH2 on your receiver with a jumper.');
    
        command_log('Trying to establish connection with the RX module ...');
        send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, 1);
    } else {
        $('#content').load("./tabs/rx_module.html", function() {
            // fill in the values
            $('input[name="failsafe_delay"]').val(RX_CONFIG.failsafe_delay);
            $('input[name="sync_time"]').val(RX_CONFIG.minsync);
            
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
                RX_CONFIG.minsync = parseInt($('input[name="sync_time"]').val());
                
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
                
                send_RX_config();
            });
        });
    }
}
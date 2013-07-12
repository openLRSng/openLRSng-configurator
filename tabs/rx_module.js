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
            
            // UI Hooks
            $('a.restore').click(function() {
                send_message(PSP.PSP_SET_RX_RESTORE_DEFAULT, 1);
                
                setTimeout(function() {
                    // request restored configuration
                    send_message(PSP.PSP_REQ_RX_CONFIG, 1);
                    setTimeout(function() {
                        tab_initialize_rx_module(); // we need to refresh this tab
                    }, 100);
                }, 50);
            });
            
            $('a.save_to_eeprom').click(function() {
                send_RX_config();
            });
        });
    }
}
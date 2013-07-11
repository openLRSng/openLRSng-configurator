function tab_initialize_rx_module() {
    command_log('Trying to establish connection with the RX module ...');
    $('#content').html('Please <strong>wait</strong> for the transmitter to establish connection with receiver module. <br />\
    Receiver always binds on bootup for <strong>0.5s</strong>, if this fails try <strong>bridging</strong> CH1-CH2 on your receiver with a jumper.');
    
    if (connected_to_RX != 1) {
        send_message(PSP.PSP_REQ_RX_JOIN_CONFIGURATION, 1);
    } else {
        $('#content').load("./tabs/rx_module.html");
    }
}
function tab_initialize_rx_failsafe() {
    $('#content').load("./tabs/rx_failsafe.html", function() {
        // populate UI
        var channels_e = $('div.tab-RX_failsafe .channels');

        for (var i = 0; i < RX_FAILSAFE_VALUES.length; i++) {

        }

        $('a.save').click(function() {
            /*
            var data = [];
            var buffer_out = [];

            for (var i = 0; i < data.length; i++) {
                buffer_out.push(highByte(data[i]));
                buffer_out.push(lowByte(data[i]));
            }

            PSP.send_message(PSP.PSP_SET_RX_FAILSAFE, buffer_out, false);
            */
        });

        $('a.back').click(function() {
            tab_initialize_rx_module();
        });
    });
}
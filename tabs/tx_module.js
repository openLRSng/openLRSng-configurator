function tab_initialize_tx_module() {
    $('#content').load("./tabs/tx_module.html", function() {
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000000); // parsing from HZ to MHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
    });
}
function tab_initialize_tx_module() {
    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function() {
        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000000); // parsing from HZ to MHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
        $('select[name="data_rate"]').val(BIND_DATA.modem_params);
    });
}
function tab_initialize_signal_monitor() {
    ga_tracker.sendAppView('Signal Monitor');

    $('#content').load("./tabs/signal_monitor.html", process_html);

    function process_html() {
        GUI.active_tab = 'signal_monitor';

        // translate to user-selected language
        localize();

        var status = $('.tab-signal_monitor .status .indicator');
        var bars = $('.tab-signal_monitor .bars');
        for (var i = 0; i < PPM.channels.length; i++) {
            bars.append('\
                <div class="bar">\
                    <div class="name">Channel - ' + (i + 1) + '</div>\
                    <meter min="800" max="2200" low="1200" high="1800"></meter>\
                    <div class="value"></div>\
                </div>\
            ');
        }

        var meter_array = [];
        $('meter', bars).each(function() {
            meter_array.push($(this));
        });

        var meter_values_array = [];
        $('.value', bars).each(function() {
            meter_values_array.push($(this));
        });

        function get_ppm() {
            PSP.send_message(PSP.PSP_REQ_PPM_IN, false, false, update_ui);
        }

        function update_ui() {
            if (PPM.ppmAge < 8) {
                status.addClass('ok');
                status.text(chrome.i18n.getMessage('signal_monitor_data_ok'));
            } else {
                status.removeClass('ok');
                status.text(chrome.i18n.getMessage('signal_monitor_data_bad'));
            }

            // update bars with latest data
            for (var i = 0; i < PPM.channels.length; i++) {
                meter_array[i].val(PPM.channels[i]);
                meter_values_array[i].text('[ ' + PPM.channels[i] + ' ]');
            }
        }

        GUI.interval_add('ppm_data_pull', get_ppm, 50, true);
    }
}
'use strict';

function tab_initialize_signal_monitor() {
    googleAnalytics.sendAppView('Signal Monitor');

    $('#content').load("./tabs/signal_monitor.html", process_html);

    function process_html() {
        GUI.active_tab = 'signal_monitor';

        // translate to user-selected language
        localize();

        var min_chan_on_input_e = $('select[name="min_channels_on_input"]'),
            status = $('.tab-signal_monitor .status .indicator'),
            bars = $('.tab-signal_monitor .bars'),
            options = '',
            meter_array = [],
            meter_values_array = [];


        if (bit_check(TX_CONFIG.flags, 6)) {
            // inverted PPM in
            $('input.ppm_in_inverted').prop('checked', true);
        }

        if (bit_check(TX_CONFIG.flags, 5)) {
            // Micro PPM in
            $('input.ppm_in_micro').prop('checked', true);
        }

        for (var i = 1; i < 16; i++) {
            min_chan_on_input_e.append('<option value="' + i + '">' + (i + 1) + 'ch</option>');
        }

        min_chan_on_input_e.val(TX_CONFIG.flags >>> 28);

        // prepare generic options
        for (var i = 0, analog = 0; i < 18; i++) {
            if (i < 16) {
                options += '<option value="' + i +'">' + chrome.i18n.getMessage('signal_monitor_channel', [i + 1]) + '</option>';
            } else {
                options += '<option value="' + i + '">' + chrome.i18n.getMessage('signal_monitor_analog', [analog++]) + '</option>';
            }
        }

        // spawn each line
        for (var i = 0; i < PPM.channels.length; i++) {
            bars.append('\
                <tr class="bar">\
                    <td class="input"><select>' + options + '</select></td>\
                    <td class="output">' + chrome.i18n.getMessage('signal_monitor_channel', [i + 1]) + '</td>\
                    <td class="meter"><meter min="800" max="2200" low="1000" high="2000"></meter></td>\
                    <td class="value"></td>\
                </tr>\
            ');

            if (TX_CONFIG.chmap) { // 3.7.0+
                bars.find('tr:last .input select').val(TX_CONFIG.chmap[i]);
            }
        }

        $('select', bars).change(function () {
            var element = $(this),
                val = parseInt(element.val()),
                index = element.parent().parent().index() - 1;

            if (TX_CONFIG.chmap) { // 3.7.0+
                if (TX_CONFIG.chmap[index] != val) {
                    element.addClass('changed');
                } else {
                    element.removeClass('changed');
                }
            }
        });

        $('a.save_to_eeprom').click(function () {
            var i = 0;

            if ($('input.ppm_in_inverted').prop('checked')) {
                TX_CONFIG.flags = bit_set(TX_CONFIG.flags, 6);
            } else {
                TX_CONFIG.flags = bit_clear(TX_CONFIG.flags, 6);
            }

            if ($('input.ppm_in_micro').prop('checked')) {
                TX_CONFIG.flags = bit_set(TX_CONFIG.flags, 5);
            } else {
                TX_CONFIG.flags = bit_clear(TX_CONFIG.flags, 5);
            }

            TX_CONFIG.flags = (TX_CONFIG.flags & 0x0FFFFFFF) | (parseInt($('select[name="min_channels_on_input"]').val()) << 28);

            $('.input select', bars).each(function () {
                if (TX_CONFIG.chmap) { // 3.7.0+
                    TX_CONFIG.chmap[i++] = parseInt($(this).val());
                }

                // remove changed highlight since we are saving the map now
                $(this).removeClass('changed');
            });

            PSP.send_config('TX');
        });

        $('td.meter meter', bars).each(function () {
            meter_array.push($(this));
        });

        $('td.value', bars).each(function () {
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
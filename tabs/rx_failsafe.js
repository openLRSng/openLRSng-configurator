'use strict';

function tab_initialize_rx_failsafe() {
    $('#content').load("./tabs/rx_failsafe.html", function() {
        googleAnalytics.sendAppView('RX Failsafe');

        // translate to user-selected language
        localize();

        // populate UI
        function populate_left() {
            var channels_left_e = $('div.tab-RX_failsafe .channels .left .data');

            // dump previous data (if any)
            channels_left_e.empty();

            for (var i = 0; i < 8; i++) {
                var block =
                    '<div class="block"> \
                        <span>Channel - ' + (i + 1) + '</span>\
                        <input type="range" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                        <input type="number" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                    </div>';

                channels_left_e.append(block);
            }
        }

        function populate_right() {
            var channels_right_e = $('div.tab-RX_failsafe .channels .right .data');

            // dump previous data (if any)
            channels_right_e.empty();

            for (var i = 8; i < 16; i++) {
                var block =
                    '<div class="block"> \
                        <span>Channel - ' + (i + 1) + '</span>\
                        <input type="range" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                        <input type="number" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                    </div>';

                channels_right_e.append(block);
            }
        }

        function bind_change_events() {
            $('div.tab-RX_failsafe .channels input[type="range"]').on('input', function() {
                $(this).next().val($(this).val());
            });

            $('div.tab-RX_failsafe .channels input[type="number"]').change(function() {
                var self = this;

                $(self).prev().val($(self).val());
            });
        }

        populate_left();
        populate_right();
        bind_change_events();

        validate_bounds('input[type="number"]');

        var save_in_progress = false;
        $('a.save').click(function() {
            if (!CONFIGURATOR.readOnly) {
                if (!save_in_progress) {
                    save_in_progress = true;

                    var data = [];
                    $('div.tab-RX_failsafe .channels input[type="range"]').each(function() {
                        data.push(parseInt($(this).val()));
                    });

                    var buffer_out = [];
                    for (var i = 0; i < data.length; i++) {
                        buffer_out.push(highByte(data[i]));
                        buffer_out.push(lowByte(data[i]));
                    }

                    var refresh_data = function () {
                        PSP.send_message(PSP.PSP_REQ_RX_FAILSAFE, false, false, refresh_ui);
                    }

                    var refresh_ui = function () {
                        save_in_progress = false;

                        populate_left();
                        populate_right();
                        bind_change_events();

                        validate_bounds('input[type="number"]');
                    }

                    PSP.send_message(PSP.PSP_SET_RX_FAILSAFE, buffer_out, false, refresh_data);
                }
            } else {
                GUI.log(chrome.i18n.getMessage('running_in_compatibility_mode'));
            }
        });

        $('a.back').click(tab_initialize_rx_module);
    });
}
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
                var failsafe = RX_FAILSAFE_VALUES[i] & 0xfff;
                var locked = RX_FAILSAFE_VALUES[i] & 0x1000;
                var block = $('\
                    <div class="block">\
                        <span>Channel - ' + (i + 1) + '</span>\
                        <input type="range" min="808" max="2192" value="' + failsafe + '" />\
                        <input type="number" min="808" max="2192" value="' + failsafe + '" />\
                        <input name="enabled" type="checkbox" title="' + chrome.i18n.getMessage('rx_failsafe_checkbox_enable_failsafe') + '" ' + ((failsafe) ? 'checked="checked"' : '') + ' />\
                        <input name="locked" type="checkbox" title="' + chrome.i18n.getMessage('rx_failsafe_checkbox_lock_failsafe') + '" ' + ((locked) ? 'checked="checked"' : '') + ' />\
                    </div>\
                ');

                if (failsafe == 0) {
                    $('input[type="range"], input[type="number"]', block).prop('disabled', true);
                }
                channels_left_e.append(block);
            }
        }

        function populate_right() {
            var channels_right_e = $('div.tab-RX_failsafe .channels .right .data');

            // dump previous data (if any)
            channels_right_e.empty();

            for (var i = 8; i < 16; i++) {
                var failsafe = RX_FAILSAFE_VALUES[i] & 0xfff;
                var locked = RX_FAILSAFE_VALUES[i] & 0x1000;
                var block = $('\
                    <div class="block">\
                        <span>Channel - ' + (i + 1) + '</span>\
                        <input type="range" min="808" max="2192" value="' + failsafe + '" />\
                        <input type="number" min="808" max="2192" value="' + failsafe + '" />\
                        <input name="enabled" type="checkbox" title="' + chrome.i18n.getMessage('rx_failsafe_checkbox_enable_failsafe') + '" ' + ((failsafe) ? 'checked="checked"' : '') + ' />\
                        <input name="locked" type="checkbox" title="' + chrome.i18n.getMessage('rx_failsafe_checkbox_lock_failsafe') + '" ' + ((locked) ? 'checked="checked"' : '') + ' />\
                    </div>\
                ');

                if (failsafe == 0) {
                    $('input[type="range"], input[type="number"]', block).prop('disabled', true);
                }

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

            $('div.tab-RX_failsafe .channels input[name="enabled"]').change(function() {
                var self = this;
                var parent = $(this).parent();
                var val = $(this).is(':checked');

                $('input[type="range"], input[type="number"]', parent).prop('disabled', !val);

                if (val) {
                    $('input[type="range"], input[type="number"]', parent).val(808);
                } else {
                    $('input[type="range"], input[type="number"]', parent).val(0);
                }
            });

            $('div.tab-RX_failsafe .channels input[name="locked"]').change(function() {
                var self = this;
                var parent = $(this).parent();
                var val = $(this).is(':checked');
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
                        var element = $(this);
                        var parent = $(this).parent();
                        var outval = 0;

                        if (!element.is(':disabled')) {
			    outval = parseInt(element.val());
                        }

                        if ($('input[name="locked"]', parent).is(':checked')) {
                            outval = outval | 0x1000;
                        }

			data.push(outval);
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

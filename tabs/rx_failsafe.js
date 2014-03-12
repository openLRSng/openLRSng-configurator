function tab_initialize_rx_failsafe() {
    $('#content').load("./tabs/rx_failsafe.html", function() {
        // populate UI
        var channels_left_e = $('div.tab-RX_failsafe .channels .left');
        var channels_right_e = $('div.tab-RX_failsafe .channels .right');

        for (var i = 0; i < 8; i++) {
            var block =
                '<div class="block"> \
                    <span>Channel - ' + (i + 1) + '</span>\
                    <input type="range" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                    <input type="number" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                </div>';

            channels_left_e.append(block);
        }

        for (var i = 8; i < 16; i++) {
            var block =
                '<div class="block"> \
                    <span>Channel - ' + (i + 1) + '</span>\
                    <input type="range" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                    <input type="number" min="808" max="2192" value="' + RX_FAILSAFE_VALUES[i] + '" />\
                </div>';

            channels_right_e.append(block);
        }

        // bind events
        $('div.tab-RX_failsafe .channels input[type="range"]').change(function() {
            $(this).next().val($(this).val());
        });

        $('div.tab-RX_failsafe .channels input[type="number"]').change(function() {
            var self = this;

            setTimeout(function() {
                $(self).prev().val($(self).val());
            }, 0);
        });

        $('a.save').click(function() {
            var data = [];

            $('div.tab-RX_failsafe .channels input[type="range"]').each(function() {
                data.push(parseInt($(this).val()));
            });

            var buffer_out = [];
            for (var i = 0; i < data.length; i++) {
                buffer_out.push(highByte(data[i]));
                buffer_out.push(lowByte(data[i]));
            }

            PSP.send_message(PSP.PSP_SET_RX_FAILSAFE, buffer_out, false);
        });

        $('a.back').click(function() {
            tab_initialize_rx_module();
        });
    });
}
function tab_initialize_uploader() {
    ga_tracker.sendAppView('Firmware Flasher');
    
    $('#content').load("./tabs/firmware_uploader.html", function() {
        GUI.active_tab = 'firmware_uploader';
        GUI.operating_mode = 2; // we are in firmware flash mode
        
        $('input[name="selected_firmware"]').change(function() {
            var val = $(this).val();

            $.get("./fw/" + val + ".hex", function(result) {
                uploader_hex_parsed = read_hex_file(result);
            });
        });
        
        $('a.flash').click(function() {
            if ($('input[name="selected_firmware"]').is(':checked') && uploader_hex_parsed) { // only allow flashing if firmware was selected and hexfile is valid
                if ($('input[name="selected_firmware"]:checked').val() == 'TX-6') {
                    // AVR109 protocol based arduino bootloaders
                    AVR109.hex_to_flash = uploader_hex_parsed;
                    AVR109.connect();
                } else if ($('input[name="selected_firmware"]:checked').val() == 'RX-32') {
                    STM32.hex_to_flash = uploader_hex_parsed;
                    STM32.connect();
                } else {
                    // STK500 protocol based arduino bootloaders
                    STK500.hex_to_flash = uploader_hex_parsed;
                    STK500.connect();
                }
            } else {
                command_log('Please first select firmware from the menu below');
            }
        });
        
        $('a.go_back').click(function() {
            if (GUI.connect_lock != true) { // back button disabled while the flash process is running
                GUI.operating_mode = 0; // we are leaving firmware flash mode
                
                tab_initialize_default();
            } else {
                command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
            }
        });
    });
}

function verify_chip_signature(high, mid, low) {
    if (high == 0x1E) { // atmega
        if (mid == 0x95) {
            if (low == 0x14) { // 328 batch
                // 328
                command_log('Chip recognized as ATmega328');
                
                return true;
            } else if (low == 0x0F) {
                // 328P
                command_log('Chip recognized as ATmega328P');
                
                return true;
            } else if (low == 0x87) {
                // 32u4
                command_log('Chip recognized as ATmega32U4 (Leonardo)');
                
                return true;
            }
        }
    } 
    
    return false;
}
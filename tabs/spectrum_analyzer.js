function tab_initialize_spectrum_analyzer() {
    $('#content').load("./tabs/spectrum_analyzer.html", function() {
        // switching operating mode to spectrum analyzer, this will swich receiving reading poll to analyzer read "protocol"
        GUI.operating_mode = 3;
        
        // requesting to join spectrum analyzer
        send_message(PSP.PSP_REQ_SCANNER_MODE, 1);
        
        // UI hooks
    });
}

var SA_message_buffer = new Array();
function SA_char_read(readInfo) {
    if (readInfo && readInfo.bytesRead > 0) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                SA_process_message(SA_message_buffer);
                
                // empty buffer
                SA_message_buffer = [];
            } else {            
                SA_message_buffer.push(data[i]);
            }
        }
    }
}

function SA_process_message(message_buffer) {
    var message_needle = 0;
    
    var message = {
        frequency: 0,
        RSSI_MAX:  0,
        RSSI_SUM:  0,
        RSSI_MIN:  0
    };
    
    for (var i = 0; i < message_buffer.length; i++) {
        if (message_buffer[i] == 0x2C) { // divider ,
            message_needle++;
        } else {
            message_buffer[i] -= 0x30;
            
            switch (message_needle) {
                case 0:
                    message.frequency = message.frequency * 10 + message_buffer[i];
                    break;
                case 1:
                    message.RSSI_MAX = message.RSSI_MAX * 10 + message_buffer[i];
                    break;
                case 2:
                    message.RSSI_SUM = message.RSSI_SUM * 10 + message_buffer[i];
                    break;
                case 3:
                    message.RSSI_MIN = message.RSSI_MIN * 10 + message_buffer[i];
                    break;
            }
        }
    } 

    console.log(message);
}
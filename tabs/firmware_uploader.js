function tab_initialize_uploader() {   
    $('#content').load("./tabs/firmware_uploader.html", function() {
        $('a.flash').click(function() {
            selected_port = String($(port_picker).val());
            selected_baud = parseInt(baud_picker.val());
            
            if (selected_port != '0') {
                chrome.serial.open(selected_port, {
                    bitrate: selected_baud
                }, uploader_onOpen);
            }
        });
    });
} 

function uploader_onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    backgroundPage.connectionId = connectionId; // pass latest connectionId to the background page
    
    if (connectionId != -1) {
        var selected_port = String($(port_picker).val());
        
        console.log('Connection was opened with ID: ' + connectionId);
        
        // start polling
        serial_poll = setInterval(uploader_readPoll, 10);
        
        // try to enter STK
        var bufferOut = new ArrayBuffer(2);
        var bufView = new Uint8Array(bufferOut);
        bufView[0] = 0x30;
        bufView[1] = 0x20;
        
        setTimeout(function() {
            chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
                if (writeInfo.bytesWritten > 0) {
                    console.log('Written: ' + writeInfo.bytesWritten + ' bytes');
                }
            });
        }, 100);
           
        
        setTimeout(function() {
            uploader_done();
        }, 1000);
    }
}

function uploader_onClosed(result) {
    console.log('Connection closed');
}

function uploader_readPoll() {
    chrome.serial.read(connectionId, 64, uploader_onCharRead);
}

function uploader_onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            console.log(data[i].toString(16));
        }
    }
}

function uploader_done() {
    chrome.serial.close(connectionId, uploader_onClosed);
}
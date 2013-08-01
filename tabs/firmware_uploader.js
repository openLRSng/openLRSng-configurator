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
        //serial_poll = setInterval(uploader_readPoll, 10);
        
        // try to enter STK
        /*
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
        */
        upload_procedure(0);
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

var upload_procedure_retry = 0;
function upload_procedure(step) {
    switch (step) {
        case 0:
            // connect to MCU via STK
            var retry = 0;
            var timer = setInterval(function() {
                stk_send([STK500.Cmnd_STK_GET_SYNC, STK500.Sync_CRC_EOP]);
                
                stk_read(2, 100, function(data) {console.log(data)});
                
                retry++;
                if (retry >= 20) {
                    clearInterval(timer);
                }
            }, 100);
            
            /*
            stk_read(2, 100, function(data) {
                if (data == 0) { // read blocked
                    upload_procedure_retry++;
                    
                    if (upload_procedure_retry >= 30) { // 3 seconds
                        command_log('Connection failed');
                        return;
                    }
                    
                    //upload_procedure(0);
                } else {
                    if (data[0] == STK500.Resp_STK_INSYNC && data[1] == STK500.Resp_STK_OK) {
                        command_log('STK in sync');
                        
                        stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_HW_VER, STK500.Sync_CRC_EOP]);
                        // flushing buffers
                        /*
                        chrome.serial.flush(connectionId, function(result) {
                            command_log('Buffers flushed');
                            
                            // proceed to next step
                            upload_procedure(1);
                        });
                    } else {
                        command_log('STK NOT in sync');
                    }
                }
            });
            */
            break;
        case 1:
            // request some info
            //stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_HW_VER, STK500.Sync_CRC_EOP]);
            /*
            stk_read(3, 100, function(data) {
                if (data == 0) {
                    upload_procedure(1);
                } else {
                    CHIP_INFO.HW_VER = data[1];
                }
            });
            */
            break;
        case 99: 
            chrome.serial.close(connectionId, uploader_onClosed);
            break;
    }
}
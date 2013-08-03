function tab_initialize_uploader() {   
    $('#content').load("./tabs/firmware_uploader.html", function() {
        $('a.flash').click(function() {
            selected_port = String($(port_picker).val());
            selected_baud = 57600; // will be replaced by something more dynamic later
            
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
        //serial_poll = setInterval(uploader_readPoll, 5);
        
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
    chrome.serial.read(connectionId, 256, uploader_onCharRead);
}

function uploader_onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            clearInterval(upload_procedure_timer);
            console.log(data[i].toString(16));        
        }
    }
}

var upload_procedure_retry = 0;
var upload_procedure_timer;
function upload_procedure(step) {
    switch (step) {
        case 0:
            // flip DTR and RTS
            chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(result){});
            
            // connect to MCU via STK
            upload_procedure_timer = setInterval(function() {
                stk_send([STK500.Cmnd_STK_GET_SYNC, STK500.Sync_CRC_EOP], 2, function(data) {
                    console.log(data); // debug
                    
                    if (data[0] == STK500.Resp_STK_INSYNC && data[1] == STK500.Resp_STK_OK) {
                        clearInterval(upload_procedure_timer);
                        command_log('STK in sync');
                        
                        // flushing buffers
                        chrome.serial.flush(connectionId, function(result) {
                            command_log('Buffers flushed');
                            
                            // proceed to next step
                            upload_procedure(1);
                        });
                    } else {
                        command_log('STK NOT in sync');
                    }
                });
                
                upload_procedure_retry++;
                
                if(upload_procedure_retry >= 300) {
                    clearInterval(upload_procedure_timer);
                    command_log('STK NOT in sync');
                }
            }, 100);
            break;
        case 1:
            // 0x80 request HW version
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_HW_VER, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                CHIP_INFO.HW_VER = data[1]; 
                
                // proceed to next step
                upload_procedure(2);
            });
            break;
        case 2:
            // 0x81 request SW version major
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SW_MAJOR, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                CHIP_INFO.SW_MAJOR = data[1]; 
                
                // proceed to next step
                upload_procedure(3);
            });
            break;
        case 3:
            // 0x82 request SW version minor
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SW_MINOR, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                CHIP_INFO.SW_MINOR = data[1]; 
                
                // proceed to next step
                upload_procedure(4);
            });
            break;
        case 4:
            // request TOP card detect (3 = no card)
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, 0x98, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                CHIP_INFO.TOPCARD_DETECT = data[1]; 
                
                // proceed to next step
                upload_procedure(5);
            });
            break;
        case 5:
            // 0x84
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_VTARGET, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(6);
            });
            break;
        case 6:
            // 0x85
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_VADJUST, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(7);
            });
            break;
        case 7:
            // 0x86
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_OSC_PSCALE, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(8);
            });
            break;
        case 8:
            // 0x87
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_OSC_CMATCH, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(9);
            });
            break;
        case 9:
            // 0x89
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SCK_DURATION, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(10);
            });
            break;
        case 10:
            // [42] . [86] . [00] . [00] . [01] . [01] . [01] . [01] . [03] . [ff] . [ff] . [ff] . [ff] . [00] . [80] . [04] . [00] . [00] . [00] . [80] . [00]   [20]
            upload_procedure(11);
            break;
        case 11:
            // [45] . [05] . [04] . [d7] . [c2] . [00]   [20]
            upload_procedure(12);
            break;
        case 12:
            // enter programming mode
            stk_send([STK500.Cmnd_STK_ENTER_PROGMODE, STK500.Sync_CRC_EOP], 2, function(data) {
                console.log(data); // debug
                
                // proceed to next step
                upload_procedure(13);
            });
            break;
        case 13:
            // read device signature (3 bytes)
            stk_send([STK500.Cmnd_STK_READ_SIGN, STK500.Sync_CRC_EOP], 5, function(data) {
                console.log(data); // debug
                
                CHIP_INFO.SIGNATURE = data[1].toString(16);
                CHIP_INFO.SIGNATURE += data[2].toString(16);
                CHIP_INFO.SIGNATURE += data[3].toString(16);
                
                // proceed to next step
                upload_procedure(14);
            });
            break;
        case 14:
            // specify address in flash
            
            // send data
            
            // repeat
            upload_procedure(15);
            break;
        case 15:
            // verify
            upload_procedure(16);
            break;
        case 16:
            // leave programming mode
            upload_procedure(99);
            break;
        case 99: 
            chrome.serial.close(connectionId, uploader_onClosed);
            break;
    }
}
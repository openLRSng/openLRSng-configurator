function tab_initialize_uploader() {   
    $('#content').load("./tabs/firmware_uploader.html", function() {
        $('a.load').click(function() {
            uploader_read_hex();
        });
        
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

function uploader_read_hex() {
    var chosenFileEntry = null;
    
    var accepts = [{
        extensions: ['hex']
    }];
    
    // load up the file
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: accepts}, function(fileEntry) {
        if (!fileEntry) {
            command_log('<span style="color: red;">No</span> file selected');
            console.log('No file selected');
            
            return;
        }
        
        chosenFileEntry = fileEntry; 
        
        // echo/console log path specified
        chrome.fileSystem.getDisplayPath(chosenFileEntry, function(path) {
            command_log('<span style="color: green;">HEX</span> file path: ' + path);
            console.log('HEX file path: ' + path);
        }); 

        // read contents into variable
        chosenFileEntry.file(function(file) {
            var reader = new FileReader();

            reader.onerror = function (e) {
                console.error(e);
            };
            
            reader.onloadend = function(e) {
                command_log('Read <span style="color: green;">SUCCESSFUL</span>');
                console.log('Read SUCCESSFUL');
                
                // we need to process/parse the hex file here, we can't afford to calculate this during flashing process
                uploader_hex_to_flash = e.target.result;
                uploader_hex_to_flash = uploader_hex_to_flash.split("\n");
                
                // check if there is an empty line in the end of hex file, if there is, remove it
                if (uploader_hex_to_flash[uploader_hex_to_flash.length - 1] == "") {
                    uploader_hex_to_flash.pop();
                }
                
                uploader_hex_to_flash_parsed = new Array();
                var flash_block = 0; // each block = 128 bytes
                var bytes_in_block = 0;
                for (var i = 0; i < uploader_hex_to_flash.length; i++) {
                    var byte_count = parseInt(uploader_hex_to_flash[i].substr(1, 2), 16) * 2; // each byte is represnted by two chars (* 2 to get the hex representation)
                    var address = uploader_hex_to_flash[i].substr(3, 4);
                    var record_type = uploader_hex_to_flash[i].substr(7, 2);
                    var data = uploader_hex_to_flash[i].substr(9, byte_count);
                    var checksum = uploader_hex_to_flash[i].substr(9 + byte_count, 2);
                   
                    if (byte_count > 0) {
                        if (uploader_hex_to_flash_parsed[flash_block] === undefined) {
                            uploader_hex_to_flash_parsed[flash_block] = new Array();
                        }
                        
                        for (var needle = 0; needle < byte_count; needle += 2) {
                            var num = parseInt(data.substr(needle, 2), 16);
                            uploader_hex_to_flash_parsed[flash_block].push(num);
                        }
                        
                        bytes_in_block += byte_count;
                        if (bytes_in_block == 256) { // 256 hex chars = 128 bytes
                            flash_block++;
                            
                            // reset counter
                            bytes_in_block = 0;
                        } 
                    }
                }
            };

            reader.readAsText(file);
        });
    });    
}

function uploader_onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    backgroundPage.connectionId = connectionId; // pass latest connectionId to the background page
    
    if (connectionId != -1) {
        var selected_port = String($(port_picker).val());        
        console.log('Connection was opened with ID: ' + connectionId);

        // start the upload procedure
        upload_procedure(0);
    }
}

var upload_procedure_retry = 0;
var upload_procedure_memory_block_address = 0;
var upload_procedure_blocks_flashed = 0;
function upload_procedure(step) {
    switch (step) {
        case 0:
            // reset some variables (in case we are reflashing)
            uploader_in_sync = 0;
            upload_procedure_memory_block_address = 0;
            upload_procedure_blocks_flashed = 0;
            
            // flip DTR and RTS
            chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(result){});
            
            // connect to MCU via STK
            upload_procedure_timer = setInterval(function() {
                stk_send([STK500.Cmnd_STK_GET_SYNC, STK500.Sync_CRC_EOP], 2, function(data) {
                    if (data[0] == STK500.Resp_STK_INSYNC && data[1] == STK500.Resp_STK_OK) {
                        clearInterval(upload_procedure_timer);
                        
                        // flushing buffers
                        chrome.serial.flush(connectionId, function(result) {
                            command_log('STK in sync - ' + data);
                            command_log('Buffers flushed');
                            
                            // protection variable
                            uploader_in_sync = 1;
                            
                            // proceed to next step
                            upload_procedure(1);
                        });
                        
                        // reset counter
                        upload_procedure_retry = 0;                        
                    } else {
                        command_log('STK NOT in sync');
                        console.log('STK NOT in sync');
                    }
                });
                
                upload_procedure_retry++;
                if (upload_procedure_retry >= 300) {
                    clearInterval(upload_procedure_timer);
                    command_log('STK NOT in sync');
                    console.log('STK NOT in sync');
                    
                    // reset counter
                    upload_procedure_retry = 0;
                }
            }, 100);
            break;
        case 1:
            // 0x80 request HW version
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_HW_VER, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting HW version - ' + data);
                CHIP_INFO.HW_VER = data[1]; 
                
                // proceed to next step
                upload_procedure(2);
            });
            break;
        case 2:
            // 0x81 request SW version major
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SW_MAJOR, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting SW version Major - ' + data);
                CHIP_INFO.SW_MAJOR = data[1]; 
                
                // proceed to next step
                upload_procedure(3);
            });
            break;
        case 3:
            // 0x82 request SW version minor
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SW_MINOR, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting SW version Minor - ' + data);
                CHIP_INFO.SW_MINOR = data[1]; 
                
                // proceed to next step
                upload_procedure(4);
            });
            break;
        case 4:
            // request TOP card detect (3 = no card)
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, 0x98, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting TOP Card info - ' + data);
                CHIP_INFO.TOPCARD_DETECT = data[1]; 
                
                // proceed to next step
                upload_procedure(5);
            });
            break;
        case 5:
            // 0x84
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_VTARGET, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting Vtarget - ' + data);
                
                // proceed to next step
                upload_procedure(6);
            });
            break;
        case 6:
            // 0x85
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_VADJUST, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting Vadjust - ' + data);
                
                // proceed to next step
                upload_procedure(7);
            });
            break;
        case 7:
            // 0x86
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_OSC_PSCALE, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting OSC prescaler - ' + data);
                
                // proceed to next step
                upload_procedure(8);
            });
            break;
        case 8:
            // 0x87
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_OSC_CMATCH, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting OSC CMATCH - '+ data);
                
                // proceed to next step
                upload_procedure(9);
            });
            break;
        case 9:
            // 0x89
            stk_send([STK500.Cmnd_STK_GET_PARAMETER, STK500.Parm_STK_SCK_DURATION, STK500.Sync_CRC_EOP], 3, function(data) {
                console.log('Requesting STK SCK DURATION - ' + data);
                
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
                console.log('Entering programming mode - ' + data);
                
                // proceed to next step
                upload_procedure(13);
            });
            break;
        case 13:
            // read device signature (3 bytes)
            stk_send([STK500.Cmnd_STK_READ_SIGN, STK500.Sync_CRC_EOP], 5, function(data) {
                console.log('Requesting device signature - ' + data);
                
                CHIP_INFO.SIGNATURE = data[1].toString(16);
                CHIP_INFO.SIGNATURE += data[2].toString(16);
                CHIP_INFO.SIGNATURE += data[3].toString(16);
                
                // proceed to next step
                upload_procedure(14);
            });
            break;
        case 14:
            // specify address in flash (low/high length)
            
            // memory block address seems to increment by 64 for each block (why?)            
            stk_send([STK500.Cmnd_STK_LOAD_ADDRESS, lowByte(upload_procedure_memory_block_address), highByte(upload_procedure_memory_block_address), STK500.Sync_CRC_EOP], 2, function(data) {
                console.log('Setting memory load address to: ' + upload_procedure_memory_block_address + ' - ' + data);
                
                // memory address is set in this point, we will increment the variable for next run
                upload_procedure_memory_block_address += 64;
                
                if (upload_procedure_blocks_flashed < uploader_hex_to_flash_parsed.length) {
                    var array_out = new Array(uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length + 5); // 5 byte overhead
                    
                    array_out[0] = STK500.Cmnd_STK_PROG_PAGE;
                    array_out[1] = 0x00;
                    array_out[2] = uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length; // should be 128 max
                    array_out[3] = 0x46; // F = flash memory
                    array_out[array_out.length - 1] = STK500.Sync_CRC_EOP;
                    
                    for (var i = 0; i < uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length; i++) {
                        array_out[i + 4] = uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed][i]; // + 4 because of protocol overhead
                    }
                    
                    stk_send(array_out, 2, function(data) {
                        upload_procedure_blocks_flashed++;
                        
                        // flash another block
                        upload_procedure(14);
                    });
                } else {
                    // proceed to next step
                    upload_procedure(15);
                }
            });
            break;
        case 15:
            // verify
            upload_procedure(16);
            break;
        case 16:
            // leave programming mode
            stk_send([STK500.Cmnd_STK_LEAVE_PROGMODE, STK500.Sync_CRC_EOP], 2, function(data) {
                console.log('Leaving programming mode - ' + data);
                
                upload_procedure(99);
            });
            break;
        case 99: 
            chrome.serial.close(connectionId, function(result) {
                console.log('Connection closed');
            });
            break;
    }
}
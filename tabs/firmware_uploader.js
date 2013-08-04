function tab_initialize_uploader() { 
    if (connectionId == -1) {
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
    } else {
        // there is an active connection, disconnect and retry
        $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
        
        setTimeout(function() {
            $('li.tab_uploader a').click();
        }, 100);
    }
} 

var uploader_hex_to_flash_parsed = new Array();
var uploader_flash_to_hex_received = new Array();
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
            console.log('HEX file path: ' + path);
            
            $('div.file_name').html(path);
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
                        for (var needle = 0; needle < byte_count; needle += 2) {
                            // if flash_block was increased and wasn't yet defined, we will define him here to avoid undefined errors
                            if (uploader_hex_to_flash_parsed[flash_block] === undefined) {
                                uploader_hex_to_flash_parsed[flash_block] = new Array();
                            }
                            
                            var num = parseInt(data.substr(needle, 2), 16); // get one byte in hex and convert it to decimal
                            uploader_hex_to_flash_parsed[flash_block].push(num); // push to 128 bit array
                            
                            bytes_in_block++;
                            if (bytes_in_block == 128) { // 256 hex chars = 128 bytes
                                // new block
                                flash_block++;
                            
                                // reset counter
                                bytes_in_block = 0;
                            }
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

var uploader_in_sync = 0;
var upload_procedure_retry = 0;
var upload_procedure_memory_block_address = 0;
var upload_procedure_blocks_flashed = 0;
var upload_procedure_eeprom_blocks_erased = 0;
function upload_procedure(step) {
    switch (step) {
        case 0:
            // reset some variables (in case we are reflashing)
            uploader_in_sync = 0;
            upload_procedure_memory_block_address = 0;
            upload_procedure_blocks_flashed = 0;
            
            // flip DTR and RTS
            chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(result){});
            upload_procedure_read_timer = setInterval(stk_read, 1); // every 1 ms
            
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
                command_log('Entering programming mode');
                
                // proceed to next step
                upload_procedure(13);
            });
            break;
        case 13:
            // read device signature (3 bytes)
            stk_send([STK500.Cmnd_STK_READ_SIGN, STK500.Sync_CRC_EOP], 5, function(data) {
                console.log('Requesting device signature - ' + data);
                
                // we need to verify chip signature
                if (verify_chip_signature(data[1], data[2], data[3])) {   
                    var erase_eeprom = $('div.erase_eeprom input').prop('checked');
                    
                    if (erase_eeprom) {
                        command_log('Erasing EEPROM...');
                        
                        // proceed to next step
                        upload_procedure(14);
                    } else {
                        command_log('Sending data ...');
                        
                        // jump over 1 step
                        upload_procedure(15);
                    }
                    
                } else {
                    command_log('Chip not supported, sorry :-(');
                    // disconnect
                    upload_procedure(99);
                }
            });
            break;
        case 14:         
            // erase eeprom
            stk_send([STK500.Cmnd_STK_LOAD_ADDRESS, lowByte(upload_procedure_eeprom_blocks_erased), highByte(upload_procedure_eeprom_blocks_erased), STK500.Sync_CRC_EOP], 2, function(data) { 
                console.log('Erasing: ' + upload_procedure_eeprom_blocks_erased + ' - ' + data);
                
                if (upload_procedure_eeprom_blocks_erased <= 256) {
                    stk_send([STK500.Cmnd_STK_PROG_PAGE, 0x00, 0x04, 0x45, 0xFF, 0xFF, 0xFF, 0xFF, STK500.Sync_CRC_EOP], 2, function(data) {
                        upload_procedure_eeprom_blocks_erased += 1;
                        
                        // wipe another block
                        upload_procedure(14);
                    });
                } else {
                    command_log('EEPROM <span style="color: green;">erased</span>');
                    
                    // reset variables
                    upload_procedure_eeprom_blocks_erased = 0;

                    // proceed to next step
                    upload_procedure(15);
                }
            });
            break;
        case 15:           
            // memory block address seems to increment by 64 for each block (probably because of 64 words per page (total of 256 pages), 1 word = 2 bytes)            
            stk_send([STK500.Cmnd_STK_LOAD_ADDRESS, lowByte(upload_procedure_memory_block_address), highByte(upload_procedure_memory_block_address), STK500.Sync_CRC_EOP], 2, function(data) {
                console.log('Writing to: ' + upload_procedure_memory_block_address + ' - ' + data);
                
                // memory address is set in this point, we will increment the variable for next run
                upload_procedure_memory_block_address += 64;
                
                if (upload_procedure_blocks_flashed < uploader_hex_to_flash_parsed.length) {
                    var array_out = new Array(uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length + 5); // 5 byte overhead
                    
                    array_out[0] = STK500.Cmnd_STK_PROG_PAGE;
                    array_out[1] = 0x00; // high byte length
                    array_out[2] = uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length; // low byte length, should be 128 bytes max
                    array_out[3] = 0x46; // F = flash memory
                    array_out[array_out.length - 1] = STK500.Sync_CRC_EOP;
                    
                    for (var i = 0; i < uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length; i++) {
                        array_out[i + 4] = uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed][i]; // + 4 bytes because of protocol overhead
                    }
                    
                    stk_send(array_out, 2, function(data) {
                        upload_procedure_blocks_flashed++;
                        
                        // flash another block
                        upload_procedure(15);
                    });
                } else {
                    command_log('Verifying data ...');
                    
                    // reset variables
                    upload_procedure_memory_block_address = 0;
                    upload_procedure_blocks_flashed = 0;
                    
                    // proceed to next step
                    upload_procedure(16);
                }
            });
            break;
        case 16:
            // verify
            stk_send([STK500.Cmnd_STK_LOAD_ADDRESS, lowByte(upload_procedure_memory_block_address), highByte(upload_procedure_memory_block_address), STK500.Sync_CRC_EOP], 2, function(data) {
                console.log('Reading from: ' + upload_procedure_memory_block_address + ' - ' + data); // debug (comment out whe not needed)
                
                // memory address is set in this point, we will increment the variable for next run
                upload_procedure_memory_block_address += 64;
                
                if (upload_procedure_blocks_flashed < uploader_hex_to_flash_parsed.length) {
                    var block_length = uploader_hex_to_flash_parsed[upload_procedure_blocks_flashed].length; // block length saved in its own variable to avoid "slow" traversing/save clock cycles
                    
                    stk_send([STK500.Cmnd_STK_READ_PAGE, 0x00, block_length, 0x46, STK500.Sync_CRC_EOP], (block_length + 2), function(data) {
                        // process & store received data
                        data.shift(); // remove first sync byte
                        data.pop(); // remove last sync byte
                        
                        uploader_flash_to_hex_received[upload_procedure_blocks_flashed] = data;
                        
                        // bump up the key
                        upload_procedure_blocks_flashed++;
                        
                        // verify another block
                        upload_procedure(16);
                    });
                } else {
                    var result = uploader_verify_data(uploader_hex_to_flash_parsed, uploader_flash_to_hex_received);
                    
                    if (result) {
                        command_log('Data verification: <span style="color: green;">OK</span>');
                    } else {
                        command_log('Data verification: <span style="color: red;">FAILED</span>');
                    }
                    
                    // proceed to next step
                    upload_procedure(17);                    
                }
            });
            break;
        case 17:
            // leave programming mode
            stk_send([STK500.Cmnd_STK_LEAVE_PROGMODE, STK500.Sync_CRC_EOP], 2, function(data) {
                console.log('Leaving programming mode - ' + data);
                command_log('Leaving programming mode');
                
                upload_procedure(99);
            });
            break;
        case 99: 
            clearInterval(upload_procedure_read_timer);
            
            chrome.serial.close(connectionId, function(result) {
                connectionId = -1; // reset connection id
                backgroundPage.connectionId = connectionId; // pass latest connectionId to the background page
            
                console.log('Connection closed');
                command_log('Connection closed');
            });
            break;
    }
}

function verify_chip_signature(high, mid, low) {
    if (high == 0x1E) { // atmega
        if (mid == 0x95) {
            if (low == 0x14) { // 328 batch
                // 328
                command_log('Chip recognized as ATmega328');
                
                return true;
            } else if (low = 0x0F) {
                // 328P
                command_log('Chip recognized as ATmega328P');
                
                return true;
            }
        }
    } 
    
    return false;
} 

function uploader_verify_data(first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        for (var inner = 0; inner < first_array[i]; inner++) {
            if (first_array[i][inner] != second_array[i][inner]) {
                return false;
            }
        }
    }
    
    return true;
}
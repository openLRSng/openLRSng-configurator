// obj = object reference
// name = string
// callback = returns true on success
function save_object_to_file(obj, name, callback) {
    chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: name, accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            return;
        }
        
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            if (debug) console.log('Saving configuration to: ' + path);
            command_log('Saving configuration to: <strong>' + path + '</strong>');
            
            // change file entry from read only to read/write
            chrome.fileSystem.getWritableEntry(fileEntry, function(fileEntryWritable) {
                // check if file is writable
                chrome.fileSystem.isWritableEntry(fileEntryWritable, function(isWritable) {
                    if (isWritable) {
                        
                        // crunch the object
                        var serialized_object = JSON.stringify({type: name, firmware_version: firmware_version, obj: obj});
                        
                        var blob = new Blob([serialized_object], {type: 'text/plain'}); // first parameter for Blob needs to be an array
                        
                        fileEntryWritable.createWriter(function(writer) {
                            writer.onerror = function (e) {
                                console.error(e);
                            };
                            
                            writer.onwriteend = function() {
                                // all went fine
                                callback(true);
                            };
                            
                            writer.write(blob);
                        }, function (e) {
                            console.error(e);
                        });
                    } else {
                        // Something went wrong or file is set to read only and cannot be changed
                        if (debug) console.log('You don\'t have write permissions for this file, sorry.');
                    }
                });
            });
        });
    });
}

// name = string
// callback = returns obj read from file
function restore_from_file(name, callback) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            return;
        }
        
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            if (debug) console.log('Reading file from: ' + path);
            command_log('Reading file from: <strong>' + path + '</strong>');
            
            fileEntry.file(function(file) {
                var reader = new FileReader();

                reader.onerror = function (e) {
                    console.error(e);
                };
                
                reader.onloadend = function(e) {
                    if (debug) console.log('File read');
                    
                    try { // check if string provided is a valid JSON
                        var deserialized_object = JSON.parse(e.target.result);
                    } catch (e) {
                        // data provided != valid json object
                        if (debug) console.log('Data provided != valid JSON string, restore aborted.');
                        command_log('File provided <span style="color: red">is not</span> valid configuration file');
                        return;
                    }
                    
                    if (deserialized_object.type == name) {
                        if (deserialized_object.firmware_version == firmware_version) {
                            callback(deserialized_object.obj);
                        } else {
                            // version doesn't match
                            command_log('Configuration version and your firmware version <span style="color: red">doesn\'t match</span>');
                        }
                    } else {
                        // type doesn't match
                        command_log('<span style="color: red">Incorrect</span> data structure detected, have you mixed up TX and RX files?');
                    }
                };

                reader.readAsText(file);
            });
        });
    });
}
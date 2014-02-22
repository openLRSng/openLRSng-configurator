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
            GUI.log('Saving configuration to: <strong>' + path + '</strong>');
            
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
                            
                            var truncated = false;
                            writer.onwriteend = function() {
                                if (!truncated) {
                                    // if file wasn't truncated, truncate now and return so callback isn't executed
                                    // onwriteend event will be fired again when truncation is complete and callback gets properly fired
                                    truncated = true;
                                    writer.truncate(blob.size);
                                    
                                    return;
                                }
                                
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

// callback = returns obj read from file
function restore_from_file(callback) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            return;
        }
        
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            if (debug) console.log('Reading file from: ' + path);
            GUI.log('Reading file from: <strong>' + path + '</strong>');
            
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
                        GUI.log('File provided <span style="color: red">is not</span> valid configuration file');
                        return;
                    }
                    
                    if (deserialized_object.firmware_version == firmware_version) {
                        callback(deserialized_object.type, deserialized_object.obj);
                    } else {
                        // version doesn't match
                        GUI.log('Configuration version and your firmware version <span style="color: red">doesn\'t match</span>');
                    }
                };

                reader.readAsText(file);
            });
        });
    });
}
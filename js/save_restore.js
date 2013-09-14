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
                        var serialized_object = JSON.stringify(obj);
                        var serialized_proto = JSON.stringify({type: name, firmware_version: firmware_version});
                        
                        var blob = new Blob([serialized_object, '\n', serialized_proto], {type: 'text/plain'}); // first parameter for Blob needs to be an array
                        
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
                        callback(false);
                    }
                });
            });
        });
    });
}

function restore_object_from_file(obj, name, callback) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            return;
        }
        
        // path specified
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
                        var objects = e.target.result.split('\n');
                        
                        var deserialized_object = JSON.parse(objects[0]);
                        var deserialized_proto = JSON.parse(objects[1]);
                    } catch (e) {
                        // data provided != valid json object
                        if (debug) console.log('Data provided != valid JSON string, restore aborted.');
                        
                        callback(false);
                        return;
                    }
                    
                    if (deserialized_proto.type == name) {
                        if (deserialized_proto.firmware_version == firmware_version) {
                            // update "passed in" object with object data from file
                            var keys = Object.keys(obj);
                            
                            for (var i = 0; i < keys.length; i++) {
                                obj[keys[i]] = deserialized_object[keys[i]];
                            }
                            
                            // all went fine
                            callback(true);
                        } else {
                            // version doesn't match
                            command_log('Configuration version and your firmware version <span style="color: red">doesn\'t match</span>');
                            
                            callback(false);
                        }
                    } else {
                        // type doesn't match
                        command_log('<span style="color: red">Incorrect</span> data structure detected, have you mixed up TX and RX files?');
                        
                        callback(false);
                    }
                };

                reader.readAsText(file);
            });
        });
    });
}
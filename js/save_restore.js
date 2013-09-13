function save_object_to_file(obj, name, callback) {
    chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: name, accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            
            callback(false);
            return false;
        }
        
        // path specified
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            if (debug) console.log('Saving file to: ' + path);
        });
        
        // change file entry from read only to read/write
        chrome.fileSystem.getWritableEntry(fileEntry, function(fileEntryWritable) {
            // check if file is writable
            chrome.fileSystem.isWritableEntry(fileEntryWritable, function(isWritable) {
                if (isWritable) {
                    
                    // crunch the object
                    var serialized_object = JSON.stringify(obj);
                    var blob = new Blob([serialized_object], {type: 'text/plain'}); // first parameter for Blob needs to be an array
                    
                    fileEntryWritable.createWriter(function(writer) {
                        writer.onerror = function (e) {
                            console.error(e);
                        };
                        
                        writer.onwriteend = function() {
                            if (debug) console.log('Object saved');
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
}

function restore_object_from_file(obj, callback) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            
            callback(false);
            return;
        }
        
        // path specified
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            if (debug) console.log('Reading file from: ' + path);
        });
        
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
                    
                    callback(false);
                    return;
                }
                
                // update "passed in" object with object data from file
                var keys = Object.keys(obj);
                
                for (var i = 0; i < keys.length; i++) {
                    obj[keys[i]] = deserialized_object[keys[i]];
                }
                
                // all went fine
                callback(true);
            };

            reader.readAsText(file);
        });
        
    });
}
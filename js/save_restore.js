function save_object_to_file(obj, name, callback) {
    chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: name, accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            
            callback(false);
            return false;
        }
        
        // echo/console log path specified
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

function restore_object_from_file(obj) {
}
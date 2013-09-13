function save_object_to_file(obj, name) {
    chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: name, accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            if (debug) console.log('No valid file selected, aborting');
            
            return false;
        }
        
        // echo/console log path specified
        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            console.log('Saving file to: ' + path);
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
                            console.log('Object saved');
                        };
                        
                        writer.write(blob);
                    }, function (e) {
                        console.error(e);
                    });
                } else {
                    // Something went wrong or file is set to read only and cannot be changed
                    console.log('You don\'t have write permissions for this file, sorry.');
                }
            });
        });
    });
}

function restore_object_from_file(obj) {
}
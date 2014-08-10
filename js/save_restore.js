'use strict';

// obj = object reference
// name = string
// callback = returns true on success
function save_object_to_file(obj, name, callback) {
    chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: name, accepts: [{extensions: ['txt']}]}, function(fileEntry) {
        if (!fileEntry) {
            // no "valid" file selected/created, aborting
            console.log('No valid file selected, aborting');
            return;
        }

        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            console.log('Saving configuration to: ' + path);
            GUI.log(chrome.i18n.getMessage('saving_configuration_to', [path]));

            // change file entry from read only to read/write
            chrome.fileSystem.getWritableEntry(fileEntry, function(fileEntryWritable) {
                // check if file is writable
                chrome.fileSystem.isWritableEntry(fileEntryWritable, function(isWritable) {
                    if (isWritable) {
                        // crunch the object
                        var serialized_object = JSON.stringify({
                            'type': name,
                            'firmware_version': CONFIGURATOR.firmwareVersionLive,
                            'configurator_version': chrome.runtime.getManifest().version,
                            'obj': obj
                        });

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
                        console.log('You don\'t have write permissions for this file, sorry.');
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
            console.log('No valid file selected, aborting');
            return;
        }

        chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
            console.log('Reading configuration from: ' + path);
            GUI.log(chrome.i18n.getMessage('reading_configuration_from', [path]));

            fileEntry.file(function(file) {
                var reader = new FileReader();

                reader.onerror = function (e) {
                    console.error(e);
                };

                reader.onloadend = function(e) {
                    try { // check if string provided is a valid JSON
                        var deserialized_object = JSON.parse(e.target.result);
                    } catch (e) {
                        // data provided != valid json object
                        console.log('Data provided != valid JSON string, restore aborted.');
                        GUI.log(chrome.i18n.getMessage('restore_configuration_file_invalid'));
                        return;
                    }

                    // data validation should be handled inside the callback
                    callback(deserialized_object);
                };

                reader.readAsText(file);
            });
        });
    });
}
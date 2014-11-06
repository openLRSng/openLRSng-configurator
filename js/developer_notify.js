// this script is currently disabled
/*
    Either chromium_main_version or chromium_version are checked (never both)
    chromium_main_version = int or false
    chromium_version      = str or false
    text                  = array of strings, double quotes (") require escaping via \

    Supported platforms - Windows, MacOS, ChromeOS, Linux, UNIX
*/
'use strict';

function request_developer_notify() {
    var chromium_version = window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/,"$1");

    var jqxhr = $.ajax("http://www.openlrsng.org/configurator/notify.json")
        .done(function(data) {
            try {
                var obj = JSON.parse(data);
            } catch (e) {
                console.log('Developer Notify: corrupted json');
                return;
            }

            // cache messages
            chrome.storage.local.get('developer_notify_cache', function(result) {
                if (typeof result.developer_notify_cache !== 'undefined') {
                    // if cache is old or time == false, save
                    if (result.developer_notify_cache.time < obj.time || obj.time == false) {
                        chrome.storage.local.set({'developer_notify_cache': obj}, function() {});
                    }
                } else {
                    // cache wasn't saved yet, save
                    chrome.storage.local.set({'developer_notify_cache': obj}, function() {});
                }
            });

            process_messages(obj);

        })
        .fail(function() {
            // use cached message (if available)
            chrome.storage.local.get('developer_notify_cache', function(result) {
                if (typeof result.developer_notify_cache !== 'undefined') {
                    process_messages(result.developer_notify_cache);
                }
            });
        });

    var process_messages = function(obj) {
        obj.messages.forEach(function(message) {
            if (message.chromium_main_version == parseInt(chromium_version.split('.')[0])) {
                if (message.platform == GUI.operating_system || message.platform == false) {
                    message.text.forEach(function(text) {
                        GUI.log(text);
                    });
                }
            } else if (message.chromium_main_version == false) {
                if (message.chromium_version == chromium_version || message.chromium_version == false) {
                    if (message.platform == GUI.operating_system || message.platform == false) {
                        message.text.forEach(function(text) {
                            GUI.log(text);
                        });
                    }
                }
            }
        });
    };
}
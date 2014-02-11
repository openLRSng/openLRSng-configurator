/*
    Either chromium_main_version or chromium_version are checked (never both)
    chromium_main_version = int or false
    chromium_version      = str or false
    text                  = array of strings, double quotes (") require escaping via \
    
    Supported platforms - Windows, MacOS, ChromeOS, Linux, UNIX
*/

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
            
        });
}
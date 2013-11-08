var debug = false; // flip this to get extra console log messages

// Get access to the background window object
// This object is used to pass current connectionId to the backround page
// so the onClosed event can close the port for us if it was left opened, without this
// users can experience weird behavior if they would like to access the serial bus afterwards.
chrome.runtime.getBackgroundPage(function(result) {
    backgroundPage = result;
    backgroundPage.app_window = window;
});

// Google Analytics BEGIN
var ga_config; // google analytics config reference (used in about tab)
var ga_tracking; // global result of isTrackingPermitted (used in about tab)

var service = analytics.getService('ice_cream_app');
service.getConfig().addCallback(function(config) {
    ga_config = config;
    ga_tracking = config.isTrackingPermitted();
});

var ga_tracker = service.getTracker('UA-32728876-5');

ga_tracker.sendAppView('Application Started');
// Google Analytics END

// Update Check BEGIN
chrome.runtime.onUpdateAvailable.addListener(function(details) { // event listener that will be fired when new .crx file is downloaded
    var bounds = chrome.app.window.current().getBounds(); // main app / window bounds

    // create new window emulating popup functionality
    chrome.app.window.create('./popups/application_update.html', {
        frame: 'none', 
        resizable: false,
        maxWidth: 400,
        maxHeight: 100,
        bounds: {left: (bounds.left + (bounds.width / 2) - 200), top: (bounds.top + (bounds.height / 2) - 50)}
    }, function(created_window) {
        created_window.contentWindow.app_latest_version = details.version;
    });
});

chrome.runtime.requestUpdateCheck(function(status) { // request update check (duh)
    if (debug) console.log('Application Update check - ' + status);
});
// Update Check END

$(document).ready(function() {
    // set bounds
    chrome.app.window.current().setBounds({width: $("#main-wrapper").outerWidth(), height: $("#main-wrapper").outerHeight()});
    
    // window.navigator.appVersion.match(/Chrome\/([0-9.]*)/)[1];
    if (debug) console.log('Running chrome version: ' + window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/,"$1"));
    
    // Tabs
    var tabs = $('#tabs > ul');
    $('a', tabs).click(function() {
        if ($(this).parent().hasClass('active') == false) { // only initialize when the tab isn't already active
            var self = this;
            var index = $(self).parent().index();
            
            if (GUI.tab_lock[index] != 1) { // tab is unlocked 
                // do some cleaning up 
                GUI.tab_switch_cleanup(function() {
                    // disable previous active button
                    $('li', tabs).removeClass('active');
                    
                    // Highlight selected button
                    $(self).parent().addClass('active');
                    
                    if ($(self).parent().hasClass('tab_TX')) {
                        tab_initialize_tx_module();
                    } else if ($(self).parent().hasClass('tab_RX')) {
                        tab_initialize_rx_module();
                    } else if ($(self).parent().hasClass('tab_spectrum_analyzer')) {
                        tab_initialize_spectrum_analyzer();
                    } else if ($(self).parent().hasClass('tab_troubleshooting')) {
                        tab_initialize_troubleshooting((GUI.operating_mode == 0 || GUI.operating_mode == 2) ? true : false);
                    } else if ($(self).parent().hasClass('tab_about')) {
                        tab_initialize_about((GUI.operating_mode == 0 || GUI.operating_mode == 2) ? true : false);
                    }
                });
            } else { // in case the requested tab is locked, echo message
                if (GUI.operating_mode == 0) {
                    command_log('You <span style="color: red;">can\'t</span> view this tab at the moment. You need to <span style="color: green">connect</span> first.');
                } else {
                    command_log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
                }
            }            
        }
    }); 
    
    // load "defualt.html" by default
    tab_initialize_default();
    
    // Check Optional USB permissions
    check_permissions();
});

function command_log(message) {
    var d = new Date();
    var time = ((d.getHours() < 10) ? '0' + d.getHours(): d.getHours()) 
        + ':' + ((d.getMinutes() < 10) ? '0' + d.getMinutes(): d.getMinutes()) 
        + ':' + ((d.getSeconds() < 10) ? '0' + d.getSeconds(): d.getSeconds());
    
    $('div#command-log > div.wrapper').append('<p>' + time + ' -- ' + message + '</p>');
    $('div#command-log').scrollTop($('div#command-log div.wrapper').height());    
}

function microtime() {
    var now = new Date().getTime() / 1000;

    return now;
}

// bitwise help functions
function highByte(num) {
    return num >> 8;
}

function lowByte(num) {
    return 0x00FF & num;
}

function bit_check(num, bit) {
    return ((num) & (1 << (bit)));
}

function bit_set(num, bit) {
    return num | 1 << bit;
}

function bit_clear(num, bit) {
    return num & ~(1 << bit);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// input field validator (using min max parameters inside html)
function validate_input_bounds(element) {
    // get respective values
    var min = parseInt(element.prop('min'));
    var max = parseInt(element.prop('max'));
    var val = parseInt(element.val());
    
    // check if input/selected value is within range
    if (val >= min && val <= max) {
        // within bounds, success
        element.removeClass('validation_failed');
        
        return true;
    } else {
        // not within bounds, failed
        element.addClass('validation_failed');
        
        return false;
    }
}

// accepting single level array with "value" as key
function array_difference(firstArray, secondArray) {
    var cloneArray = [];
    
    // create hardcopy
    for (var i = 0; i < firstArray.length; i++) {
        cloneArray.push(firstArray[i]);
    }
    
    for (var i = 0; i < secondArray.length; i++) {
        if (cloneArray.indexOf(secondArray[i]) != -1) {
            cloneArray.splice(cloneArray.indexOf(secondArray[i]), 1);
        }
    }
    
    return cloneArray;
}
var debug = false; // flip this to get extra console log messages

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
    if (GUI.active_tab == 'default') { // only trigger this on default tab (rest of the tabs doesn't have the app_update html elements inside of them)
        $('div.app_update span.version').html(details.version);
        $('div.app_update').show();
        
        // UI hooks
        $('a.yes').click(function() {
            chrome.runtime.reload();
        });
        
        $('a.no').click(function() {
            $('div.app_update').hide();
        });
    }
});

chrome.runtime.requestUpdateCheck(function(status) { // request update check (duh)
    if (debug) console.log('Application Update check - ' + status);
});
// Update Check END

$(document).ready(function() {
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
    
    // for debug purposes only
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
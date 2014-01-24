var debug = true; // flip this to get extra console log messages

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
    chrome.app.window.current().setBounds({width: $("#outter-wrapper").outerWidth(), height: $("#outter-wrapper").outerHeight()});
    
    // bind controls  
    $('#frame .minimize').click(function() {
        chrome.app.window.current().minimize();
    }); 

    $('#frame .maximize').click(function() {
    });
    
    $('#frame .close').click(function() {
        chrome.app.window.current().close();
    });     
    
    // window.navigator.appVersion.match(/Chrome\/([0-9.]*)/)[1];
    if (debug) console.log('Running chrome version: ' + window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/,"$1"));
    
    // apply unlocked indicators
    GUI.lock_default();   
    
    // Tabs
    var tabs = $('#tabs > ul');
    $('a', tabs).click(function() {
        if ($(this).parent().hasClass('active') == false) { // only initialize when the tab isn't already active
            var self = this;
            var index = $(self).parent().index();
            
            if (GUI.tab_lock[index] != 1) { // tab is unlocked 
                // do some cleaning up 
                GUI.tab_switch_cleanup(function() {
                    // disable previously active tab highlight
                    $('li', tabs).removeClass('active');
                    
                    // get tab class name (there should be only one class listed)
                    var tab = $(self).parent().prop('class');
                    
                    // Highlight selected tab
                    $(self).parent().addClass('active');
                    
                    switch (tab) {
                        case 'tab_TX':
                            tab_initialize_tx_module();
                            break;
                        case 'tab_RX':
                            tab_initialize_rx_module();
                            break;
                        case 'tab_spectrum_analyzer':
                            tab_initialize_spectrum_analyzer();
                            break;
                        case 'tab_troubleshooting':
                            tab_initialize_troubleshooting((!GUI.module) ? true : false);
                            break;
                        case 'tab_options':
                            tab_initialize_options((!GUI.module) ? true : false);
                            break;
                        case 'tab_about':
                            tab_initialize_about((!GUI.module) ? true : false);
                            break;                           
                    }
                });
            } else { // in case the requested tab is locked, echo message
                if (GUI.operating_mode == 0) {
                    GUI.log('You <span style="color: red;">can\'t</span> view this tab at the moment. You need to <span style="color: green">connect</span> first.');
                } else {
                    if (GUI.module != 'RX') {
                        GUI.log("You <span style=\"color: red\">can't</span> do this right now, please wait for current operation to finish ...");
                    } else {
                        GUI.log("You <span style=\"color: red\">can't</span> view this tab because you are connected to an RX module.");
                    }
                }
            }            
        }
    }); 
    
    // load "defualt.html" by default
    tab_initialize_default(function() {
        // When default.html loads for the first time, check Optional USB permissions
        check_usb_permissions();
    });
    
    // listen to all input change events and adjust the value within limits if necessary
    $("#content").on('focus', 'input[type="number"]', function() {
        var element = $(this);
        var val = element.val();
        
        if (!isNaN(val)) {
            element.data('previousValue', parseFloat(val));
        }
    });
    
    $("#content").on('keydown', 'input[type="number"]', function(e) {
        // whitelist all that we need for numeric control
        if ((e.keyCode >= 96 && e.keyCode <= 105) || (e.keyCode >= 48 && e.keyCode <= 57)) { // allow numpad and standard number keypad
        } else if (e.keyCode == 190 || e.keyCode == 110) { // allow and decimal point
        } else if ((e.keyCode >= 37 && e.keyCode <= 40) || e.keyCode == 13) { // allow arrows, enter
        } else {
            // block everything else
            e.preventDefault();
        }
    });
    
    $("#content").on('change', 'input[type="number"]', function() {
        var element = $(this);
        var min = parseFloat(element.prop('min'));
        var max = parseFloat(element.prop('max'));
        var step = parseFloat(element.prop('step'));
        var val = parseFloat(element.val());
        
        // only adjust minimal end if bound is set
        if (element.prop('min')) {
            if (val < min) element.val(min);
        }
        
        // only adjust maximal end if bound is set
        if (element.prop('max')) {
            if (val > max) element.val(max);
        }
        
        // if entered value is illegal use previous value instead
        if (isNaN(val)) {
            element.val(element.data('previousValue'));
        }
        
        // if step is not set or step is int and value is float use previous value instead
        if (isNaN(step) || step % 1 === 0) {
            if (val % 1 !== 0) {
                element.val(element.data('previousValue'));
            }
        }
    });
});

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

/*
function add_custom_spinners() {
    var spinner_element = '<div class="spinner"><div class="up"></div><div class="down"></div></div>';
    
    $('input[type="number"]').each(function() {
        var input = $(this);
        
        // only add new spinner if one doesn't already exist
        if (!input.next().hasClass('spinner')) {
            var isInt = true;
            if (input.prop('step') == '') {
                isInt = true;
            } else {
                if (input.prop('step').indexOf('.') == -1) {
                    isInt = true;
                } else {
                    isInt = false;
                }
            }
            
            // make space for spinner
            input.width(input.width() - 16);
            
            // add spinner
            input.after(spinner_element);
            
            // get spinner refference
            var spinner = input.next();
            
            // bind UI hooks to spinner
            $('.up', spinner).click(function() {
                up();
            });
            
            $('.up', spinner).mousedown(function() {            
                GUI.timeout_add('spinner', function() {
                    GUI.interval_add('spinner', function() {
                        up();
                    }, 100, true);
                }, 250);
            });
            
            $('.up', spinner).mouseup(function() {
                GUI.timeout_remove('spinner');
                GUI.interval_remove('spinner');
            });
            
            $('.up', spinner).mouseleave(function() {            
                GUI.timeout_remove('spinner');
                GUI.interval_remove('spinner');
            });
            
            
            $('.down', spinner).click(function() {
                down();
            });
            
            $('.down', spinner).mousedown(function() {            
                GUI.timeout_add('spinner', function() {
                    GUI.interval_add('spinner', function() {
                        down();
                    }, 100, true);
                }, 250);
            });
            
            $('.down', spinner).mouseup(function() {
                GUI.timeout_remove('spinner');
                GUI.interval_remove('spinner');
            });
            
            $('.down', spinner).mouseleave(function() {
                GUI.timeout_remove('spinner');
                GUI.interval_remove('spinner');
            });
            
            var up = function() {
                if (isInt) {
                    var current_value = parseInt(input.val());
                    input.val(current_value + 1);
                } else {
                    var current_value = parseFloat(input.val());
                    var step = parseFloat(input.prop('step'));
                    var step_decimals = input.prop('step').length - 2;
                    
                    input.val((current_value + step).toFixed(step_decimals));
                }
                
                input.change();
            };
            
            var down = function() {
                if (isInt) {
                    var current_value = parseInt(input.val());
                    input.val(current_value - 1);
                } else {
                    var current_value = parseFloat(input.val());
                    var step = parseFloat(input.prop('step'));
                    var step_decimals = input.prop('step').length - 2;
                    
                    input.val((current_value - step).toFixed(step_decimals));
                }
                
                input.change();
            };
        }
    });
}
*/
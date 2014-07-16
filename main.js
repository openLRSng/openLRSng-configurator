// Get access to the background window object
// This object is used to pass current connectionId to the backround page
// so the onClosed event can close the port for us if it was left opened, without this
// users can experience weird behavior if they would like to access the serial bus afterwards.
chrome.runtime.getBackgroundPage(function(result) {
    backgroundPage = result;
    backgroundPage.app_window = window;
});

// Google Analytics
var googleAnalyticsService = analytics.getService('ice_cream_app');
var googleAnalytics = googleAnalyticsService.getTracker('UA-32728876-5');
var googleAnalyticsConfig = false;
googleAnalyticsService.getConfig().addCallback(function(config) {
    googleAnalyticsConfig = config;
});

$(document).ready(function() {
    googleAnalytics.sendAppView('Application Started');

    // translate to user-selected language
    localize();

    // alternative - window.navigator.appVersion.match(/Chrome\/([0-9.]*)/)[1];
    GUI.log(chrome.i18n.getMessage('startup_info_message',
        [GUI.operating_system, window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/,"$1"), chrome.runtime.getManifest().version]));

    // Live message from developers
    request_developer_notify();

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

                    // detach listeners and remove element data
                    $('#content').empty();

                    switch (tab) {
                        case 'tab_TX':
                            tab_initialize_tx_module();
                            break;
                        case 'tab_RX':
                            tab_initialize_rx_module();
                            break;
                        case 'tab_signal_monitor':
                            tab_initialize_signal_monitor();
                            break;
                        case 'tab_spectrum_analyzer':
                            tab_initialize_spectrum_analyzer();
                            break;
                        case 'tab_troubleshooting':
                            tab_initialize_troubleshooting((!GUI.module) ? true : false);
                            break;
                        case 'tab_about':
                            tab_initialize_about((!GUI.module) ? true : false);
                            break;
                    }
                });
            } else { // in case the requested tab is locked, echo message
                if (GUI.operating_mode == 0) {
                    GUI.log(chrome.i18n.getMessage('error_connect_first'));
                } else {
                    if (GUI.module != 'RX') {
                        GUI.log(chrome.i18n.getMessage('error_operation_in_progress'));
                    } else {
                        GUI.log(chrome.i18n.getMessage('error_cannot_view_tx_tabs_while_connected_as_rx'));
                    }
                }
            }
        }
    });

    tab_initialize_default();

    // options
    $('a#options').click(function() {
        var el = $(this);

        if (!el.hasClass('active')) {
            el.addClass('active');
            el.after('<div id="options-window"></div>');
            $('div#options-window').load('./tabs/options.html', function() {
                googleAnalytics.sendAppView('Options');

                // translate to user-selected language
                localize();

                // if RTS is enabled, check the rts checkbox
                if (GUI.disable_quickjoin == true) {
                    $('div.quickjoin input').prop('checked', true);
                }

                $('div.quickjoin input').change(function() {
                    GUI.disable_quickjoin = $(this).is(':checked');

                    chrome.storage.local.set({'disable_quickjoin': GUI.disable_quickjoin});
                });

                // if notifications are enabled, or wasn't set, check the notifications checkbox
                chrome.storage.local.get('update_notify', function(result) {
                    if (typeof result.update_notify === 'undefined' || result.update_notify) {
                        $('div.notifications input').prop('checked', true);
                    }
                });

                $('div.notifications input').change(function() {
                    var check = $(this).is(':checked');

                    chrome.storage.local.set({'update_notify': check});
                });

                // if tracking is enabled, check the statistics checkbox
                if (googleAnalyticsConfig.isTrackingPermitted()) {
                    $('div.statistics input').prop('checked', true);
                }

                $('div.statistics input').change(function() {
                    var result = $(this).is(':checked');
                    googleAnalyticsConfig.setTrackingPermitted(result);
                });

                function close_and_cleanup(e) {
                    if (!$.contains($('div#options-window')[0], e.target)) {
                        $(document).unbind('click', close_and_cleanup);

                        $('div#options-window').slideUp(function() {
                            el.removeClass('active');
                            $(this).empty().remove();
                        });
                    }
                }

                $(document).bind('click', close_and_cleanup);

                $(this).slideDown();
            });
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
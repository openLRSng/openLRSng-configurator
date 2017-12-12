'use strict';

// Google Analytics
var googleAnalyticsService = analytics.getService('ice_cream_app');
var googleAnalytics = googleAnalyticsService.getTracker('UA-32728876-5');
var googleAnalyticsConfig = false;
googleAnalyticsService.getConfig().addCallback(function (config) {
    googleAnalyticsConfig = config;
});

// Global error handling (for primary thread, errors that occur inside background page are uncaught since they are in different context)
// All uncaught errors will bubble up in here (keep in mind that errors that happen inside try/catch block won't bubble up)
window.onerror = function (errorMessage, url, lineNumber, columnNumber) {
    var file = url.split('/');
    file = file[file.length - 1];

    googleAnalytics.sendException(errorMessage + ', ' + file + ', ' + lineNumber + ', ' + columnNumber, true);
};

$(document).ready(function () {
    // translate to user-selected language
    localize();

    // alternative - window.navigator.appVersion.match(/Chrome\/([0-9.]*)/)[1];
    GUI.log(chrome.i18n.getMessage('startup_info_message', [GUI.operating_system, window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/, "$1"), getManifestVersion()]));

    checkForConfiguratorUpdates();

    // log library versions in console to make version tracking easier
    console.log('Libraries: jQuery - ' + $.fn.jquery + ', d3 - ' + d3.version);

    // apply unlocked indicators
    GUI.lock_default();

    // Tabs
    var tabs = $('#tabs > ul');
    $('a', tabs).click(function () {
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
    $('a#options').click(function () {
        var el = $(this);

        if (!el.hasClass('active')) {
            el.addClass('active');
            el.after('<div id="options-window"></div>');
            $('div#options-window').load('./tabs/options.html', function () {
                googleAnalytics.sendAppView('Options');

                // translate to user-selected language
                localize();

                // if RTS is enabled, check the rts checkbox
                if (GUI.disable_quickjoin == true) {
                    $('div.quickjoin input').prop('checked', true);
                }

                $('div.quickjoin input').change(function () {
                    GUI.disable_quickjoin = $(this).is(':checked');

                    chrome.storage.local.set({'disable_quickjoin': GUI.disable_quickjoin});
                });

                // if notifications are enabled, or wasn't set, check the notifications checkbox
                chrome.storage.local.get('update_notify', function (result) {
                    if (typeof result.update_notify === 'undefined' || result.update_notify) {
                        $('div.notifications input').prop('checked', true);
                    }
                });

                // if tracking is enabled, check the statistics checkbox
                if (googleAnalyticsConfig.isTrackingPermitted()) {
                    $('div.statistics input').prop('checked', true);
                }

                $('div.statistics input').change(function () {
                    var result = $(this).is(':checked');
                    googleAnalyticsConfig.setTrackingPermitted(result);
                });

                if (GUI.operating_system !== 'ChromeOS') {
                    chrome.storage.local.get('checkForConfiguratorUnstableVersions', function (result) {
                        if (result.checkForConfiguratorUnstableVersions) {
                            $('div.checkForConfiguratorUnstableVersions input').prop('checked', true);
                        }

                        $('div.checkForConfiguratorUnstableVersions input').change(function () {
                            var checked = $(this).is(':checked');

                            chrome.storage.local.set({'checkForConfiguratorUnstableVersions': checked});

                            checkForConfiguratorUpdates();
                        });
                    });
                } else {
                    $('div.checkForConfiguratorUnstableVersions').hide();
                }

                function close_and_cleanup(e) {
                    if (e.type == 'click' && !$.contains($('div#options-window')[0], e.target) || e.type == 'keyup' && e.keyCode == 27) {
                        $(document).unbind('click', close_and_cleanup);

                        $('div#options-window').slideUp(250, function () {
                            el.removeClass('active');
                            $(this).empty().remove();
                        });
                    }
                }

                $(document).bind('click keyup', close_and_cleanup);

                $(this).slideDown(250);
            });
        }
    });
});

function catch_startup_time(startTime) {
    var endTime = new Date().getTime(),
        timeSpent = endTime - startTime;

    googleAnalytics.sendTiming('Load Times', 'Application Startup', timeSpent);
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

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

function getManifestVersion(manifest) {
    if (!manifest) {
        manifest = chrome.runtime.getManifest();
    }

    var version = manifest.version_name;
    if (!version) {
        version = manifest.version;
    }

    return version;
};

function checkForConfiguratorUpdates() {
	setTimeout(function () {
    var releaseChecker = new ReleaseChecker('configurator', 'https://api.github.com/repos/openLRSng/openLRSng-configurator/releases');

    releaseChecker.loadReleaseData(notifyOutdatedVersion);
	}, 2000);
};

function notifyOutdatedVersion(releaseData) {
    chrome.storage.local.get('checkForConfiguratorUnstableVersions', function (result) {
        var showUnstableReleases = false;
        if (result.checkForConfiguratorUnstableVersions) {
            showUnstableReleases = true;
        }
         var versions = releaseData.filter(function (version) {
             var semVerVersion = semver.parse(version.tag_name);
             if (semVerVersion && (showUnstableReleases || semVerVersion.prerelease.length === 0)) {
                 return version;
             }
         }).sort(function (v1, v2) {
            try {
                return semver.compare(v2.tag_name, v1.tag_name);
            } catch (e) {
                return false;
            }
        });

        if (versions.length > 0 && semver.lt(getManifestVersion(), versions[0].tag_name)) {
            GUI.log(chrome.i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));

            var dialog = $('.dialogConfiguratorUpdate')[0];

            $('.dialogConfiguratorUpdate-content').html(chrome.i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));

            $('.dialogConfiguratorUpdate-closebtn').click(function() {
                dialog.close();
            });

            $('.dialogConfiguratorUpdate-websitebtn').click(function() {
                dialog.close();

                window.open(versions[0].html_url);
            });

            dialog.showModal();
        }
    });
};
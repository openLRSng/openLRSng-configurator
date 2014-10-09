'use strict';

function tab_initialize_default(callback) {
    $('#content').load("./tabs/default.html", function () {
        if (GUI.active_tab != 'default') {
            GUI.active_tab = 'default';
            googleAnalytics.sendAppView('Default Page');
        }

        check_usb_permissions();

        // translate to user-selected language
        localize();

        // load changelog content
        $('div.changelog.configurator .wrapper').load('./changelogs/configurator.html');
        $('div.changelog.firmware .wrapper').load('./changelogs/firmware.html');

        // UI hooks
        $('.tab-default a.firmware_upload, .tab-default a.firmware_upload_button').click(function () {
            // firmware flasher button is locked while GUI is connecting/connected to a com port
            // prevents disconnect routine getting stuck while GUI.connect_lock is true
            if (!GUI.connecting_to && !GUI.connected_to) {
                tab_initialize_uploader();
            } else {
                GUI.log(chrome.i18n.getMessage('error_operation_in_progress'));
            }
        });

        if (callback) callback();
    });
}
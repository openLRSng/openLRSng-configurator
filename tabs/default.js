'use strict';

function tab_initialize_default(callback) {
    $('#content').load("./tabs/default.html", function () {
        if (GUI.active_tab != 'default') {
            GUI.active_tab = 'default';
            googleAnalytics.sendAppView('Default Page');
        }

        //check_usb_permissions();

        // 32u4 fix for chrome 41
        chrome.storage.local.get('using_32u4', function (result) {
            if (result.using_32u4 === 'undefined' || !result.using_32u4) {
                GUI.using_32u4 = false;
                $('.atmega32u4 [name="using_32u4"]').prop('checked', false);
            } else {
                GUI.using_32u4 = true;
                $('.atmega32u4 [name="using_32u4"]').prop('checked', true);
            }

            $('.atmega32u4 [name="using_32u4"]').on('change', function () {
                var status = $(this).is(':checked');
                GUI.using_32u4 = status;

                chrome.storage.local.set({'using_32u4': status});
            });
        });

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
function tab_initialize_default() {
    $('#content').load("./tabs/default.html", function() {
        GUI.active_tab = 'default';
        
        // load changelog content
        $('div.changelog.configurator .wrapper').load('./changelog_configurator.html');
        $('div.changelog.firmware .wrapper').load('./changelog_firmware.html');
        
        // UI hooks
        $('.tab-default a.firmware_upload, .tab-default a.firmware_upload_button').click(function() {
            tab_initialize_uploader();
        });
    });
}
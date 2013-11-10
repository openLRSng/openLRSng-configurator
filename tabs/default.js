function tab_initialize_default(callback) {
    $('#content').load("./tabs/default.html", function() {
        GUI.active_tab = 'default';
        
        // load changelog content
        $('div.changelog.configurator .wrapper').load('./changelogs/configurator.html');
        $('div.changelog.firmware .wrapper').load('./changelogs/firmware.html');
        
        // UI hooks
        $('.tab-default a.firmware_upload, .tab-default a.firmware_upload_button').click(function() {
            tab_initialize_uploader();
        });
        
        if (callback) callback(); // callback primarily used for check_permissions function in main.js
    });
}
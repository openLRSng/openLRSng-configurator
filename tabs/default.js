function tab_initialize_default() {
    $('#content').load("./tabs/default.html", function() {
        GUI.active_tab = 'default';
        
        // load changelog content
        $('div.changelog .wrapper').load('./changelog.html');
        
        // UI hooks
        $('.tab-default a.firmware_upload, .tab-default a.firmware_upload_button').click(function() {
            tab_initialize_uploader();
        });
    });
}
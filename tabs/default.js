function tab_initialize_default() {
    $('#content').load("./tabs/default.html", function() {
        $('.tab-default a.firmware_upload, .tab-default a.firmware_upload_button').click(function() {
            tab_initialize_uploader();
        });
    
    });
}
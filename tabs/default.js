function tab_initialize_default() {
    $('#content').load("./tabs/default.html", function() {
        $('.tab-default a.firmware_upload').click(function() {
            tab_initialize_uploader();
        });
    
    });
}
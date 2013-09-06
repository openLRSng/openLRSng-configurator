function tab_initialize_about(status) {
    ga_tracker.sendAppView('About Page');
    
    $('#content').load("./tabs/about.html", function() {
        if (status) { // if status is true, add "return to default button"
            $('div.tab-about').append('<a class="back" href="#" title="Back">Back</a>');
            
            $('a.back').click(function() {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        }
        
        // if tracking is enabled, check the statistics checkbox
        if (ga_tracking == true) {
            $('div.statistics input').prop('checked', true);
        }
        
        $('div.statistics input').change(function() {
            var check = $(this).is(':checked');
            ga_config.setTrackingPermitted(check);
        });
    });
}
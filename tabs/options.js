function tab_initialize_options(status) {
    ga_tracker.sendAppView('Options');
    
    $('#content').load("./tabs/options.html", function() {
        GUI.active_tab = 'options';
        
        if (status) { // if status is true, add "return to default button"
            $('div.tab-options').append('<a class="back" href="#" title="Back">Back</a>');
            
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
        
        // if RTS is enabled, check the rts checkbox
        if (GUI.use_rts == true) {
            $('div.rts input').prop('checked', true);
        }
        
        $('div.rts input').change(function() {
            GUI.use_rts = $(this).is(':checked');
            
            chrome.storage.local.set({'use_rts': GUI.use_rts});
        });
    });
}
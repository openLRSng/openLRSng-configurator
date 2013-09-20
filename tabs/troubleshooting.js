function tab_initialize_troubleshooting(status) {
    ga_tracker.sendAppView('Troubleshooting');
    
    $('#content').load("./tabs/troubleshooting.html", function() {
        if (status) { // if status is true, add "return to default button"
            $('div.tab-troubleshooting').append('<a class="back" href="#" title="Back">Back</a>');
            
            $('a.back').click(function() {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        }
        
        // expand / collapse
        $('div.tab-troubleshooting .cat .title').click(function() {
            var self = this;
            var state = $(this).data('state');
            
            if (state) {
                $('span', this).html('[click to expand]');
                $(this).parent().find('div.content').slideUp(function() {
                    $(self).css('border-bottom', '0');
                });
            } else {
                $('span', this).html('[click to collapse]');
                $(this).css('border-bottom', '1px solid silver');
                $(this).parent().find('div.content').slideDown();
            }
            
            $(this).data('state', !state);
        });
    });
}
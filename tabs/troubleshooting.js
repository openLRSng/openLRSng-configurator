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
    });
}
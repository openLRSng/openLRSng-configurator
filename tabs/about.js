function tab_initialize_about(status) {
    ga_tracker.sendAppView('About Page');

    $('#content').load("./tabs/about.html", function() {
        GUI.active_tab = 'about';

        if (status) { // if status is true, add "return to default button"
            $('div.tab-about').append('<a class="back" href="#" title="Back">Back</a>');

            $('a.back').click(function() {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        }
    });
}
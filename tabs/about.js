'use strict';

function tab_initialize_about(status) {
    googleAnalytics.sendAppView('About Page');

    $('#content').load("./tabs/about.html", function () {
        GUI.active_tab = 'about';

        // translate to user-selected language
        localize();

        if (status) { // if status is true, add "return to default button"
            $('a.back').click(function () {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        } else {
            $('div.tab-about .back').hide();
        }
    });
}
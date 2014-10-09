'use strict';

function tab_initialize_about(status) {
    $('#content').load("./tabs/about.html", function () {
        if (GUI.active_tab != 'about') {
            GUI.active_tab = 'about';
            googleAnalytics.sendAppView('About Page');
        }

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
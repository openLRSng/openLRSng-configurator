'use strict';

function tab_initialize_troubleshooting(status) {
    googleAnalytics.sendAppView('Troubleshooting');

    $('#content').load("./tabs/troubleshooting.html", function() {
        GUI.active_tab = 'troubleshooting';

        if (status) { // if status is true, add "return to default button"
            $('a.back').click(function() {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        } else {
            $('div.tab-troubleshooting a.back').hide();
        }

        // translate to user-selected language
        localize();

        // expand / collapse
        $('div.tab-troubleshooting .cat .title').click(function() {
            var self = this;
            var state = $(this).data('state');

            if (state) {
                $('span:nth-child(2)', this).html(chrome.i18n.getMessage('troubleshooting_click_to_expand'));
                $(this).parent().find('div.content').slideUp(function() {
                    $(self).css('border-bottom', '0');
                });
            } else {
                $('span:nth-child(2)', this).html(chrome.i18n.getMessage('troubleshooting_click_to_collapse'));
                $(this).css('border-bottom', '1px solid silver');
                $(this).parent().find('div.content').slideDown();
            }

            $(this).data('state', !state);
        });
    });
}
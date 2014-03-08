$(document).ready(function() {
    // Set Version
    $('div.app_update span.version').html(app_latest_version);

    // UI hooks
    $('a.yes').click(function() {
        chrome.runtime.reload();
    });

    $('a.no').click(function() {
        chrome.app.window.current().close();
    });
});
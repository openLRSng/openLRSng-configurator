function command_log(message) {
    var d = new Date();
    var time = ((d.getHours() < 10) ? '0' + d.getHours(): d.getHours()) 
        + ':' + ((d.getMinutes() < 10) ? '0' + d.getMinutes(): d.getMinutes()) 
        + ':' + ((d.getSeconds() < 10) ? '0' + d.getSeconds(): d.getSeconds());
    
    $('div#command-log > div.wrapper').append('<p>' + time + ' -- ' + message + '</p>');
    $('div#command-log').scrollTop($('div#command-log div.wrapper').height());    
}

$(document).ready(function() {
    // Tabs
    var tabs = $('#tabs > ul');
    $('a', tabs).click(function() {
        if ($(this).parent().hasClass('active') == false && TX_data_received == true) { // only initialize when the tab isn't already active
            if (connectionId < 1) { // if there is no active connection, return
                command_log('You <span style="color: red;">can\'t</span> view tabs at the moment. You need to <span style="color: green">connect</span> first.');
                return;
            }
            
            // disable previous active button
            $('li', tabs).removeClass('active');
            
            // Highlight selected button
            $(this).parent().addClass('active');
            
            if ($(this).parent().hasClass('tab_TX')) {
                tab_initialize_tx_module();
            } else if ($(this).parent().hasClass('tab_RX')) {
                tab_initialize_rx_module();
            }          
        }
    }); 
    
    // load "defualt.html" by default
    $('#content').load("./tabs/default.html");
    
    // for debug purposes only
    //$('#content').load("./tabs/tx_module.html");
});
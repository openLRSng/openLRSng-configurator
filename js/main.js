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
        if ($(this).parent().hasClass('active') == false && TX_data_received == true || $(this).parent().hasClass('active') == false && $(this).parent().hasClass('tab_uploader') == true) { // only initialize when the tab isn't already active
            if (connectionId < 1 && $(this).parent().hasClass('tab_uploader') != true) { // if there is no active connection, return
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
            } else if ($(this).parent().hasClass('tab_uploader')) {
                tab_initialize_uploader();
            }             
        }
    }); 
    
    // load "defualt.html" by default
    $('#content').load("./tabs/default.html");
    
    // for debug purposes only
    //tab_initialize_uploader();
});


// bitwise help functions
function highByte(num) {
    return num >> 8;
}

function lowByte(num) {
    return 0x00FF & num;
}

function bit_check(num, bit) {
    return ((num) & (1 << (bit)));
}

function bit_set(num, bit) {
    return num | 1 << bit;
}

function bit_clear(num, bit) {
    return num & ~(1 << bit);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
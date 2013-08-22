function tab_initialize_spectrum_analyzer() {
    $('#content').load("./tabs/spectrum_analyzer.html", function() {
        // first thing we need to do is "jump" into spectrum analyzer mode
        // and then we need to change the receive serial handler from PSP to the ASCII protocol that spectrum analyzer uses
    });
}
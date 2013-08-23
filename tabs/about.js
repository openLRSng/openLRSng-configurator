function tab_initialize_about(status) {
    $('#content').load("./tabs/about.html", function() {
        if (status) { // if status is true, add "return to default button"
            $('div.tab-about').append('<a class="back" href="#" title="Back">Back</a>');
            $('a.back').click(function() {
                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
                tab_initialize_default();
            });
        }
    });
}
function validate_bounds(selector) {
    // listen to all input change events and adjust the value within limits if necessary
    $(selector).focus(function() {
        var element = $(this);
        var val = element.val();

        if (!isNaN(val)) {
            element.data('previousValue', parseFloat(val));
        }
    });

    $(selector).keydown(function(e) {
        // whitelist all that we need for numeric control
        if ((e.keyCode >= 96 && e.keyCode <= 105) || (e.keyCode >= 48 && e.keyCode <= 57)) { // allow numpad and standard number keypad
        } else if (e.keyCode == 109 || e.keyCode == 189) { // minus on numpad and in standard keyboard
        } else if (e.keyCode == 8 || e.keyCode == 46) { // backspace and delete
        } else if (e.keyCode == 190 || e.keyCode == 110) { // allow and decimal point
        } else if ((e.keyCode >= 37 && e.keyCode <= 40) || e.keyCode == 13) { // allow arrows, enter
        } else {
            // block everything else
            e.preventDefault();
        }
    });

    $(selector).change(function() {
        var element = $(this);
        var min = parseFloat(element.prop('min'));
        var max = parseFloat(element.prop('max'));
        var step = parseFloat(element.prop('step'));
        var val = parseFloat(element.val());

        // only adjust minimal end if bound is set
        if (element.prop('min')) {
            if (val < min) element.val(min);
        }

        // only adjust maximal end if bound is set
        if (element.prop('max')) {
            if (val > max) element.val(max);
        }

        // if entered value is illegal use previous value instead
        if (isNaN(val)) {
            element.val(element.data('previousValue'));
        }

        // if step is not set or step is int and value is float use previous value instead
        if (isNaN(step) || step % 1 === 0) {
            if (val % 1 !== 0) {
                element.val(element.data('previousValue'));
            }
        }

        // if step is set and is float and value is int, convert to float, keep decimal places in float according to step *experimental*
        if (!isNaN(step) && step % 1 !== 0) {
            var decimal_places = String(step).split('.')[1].length;

            if (val % 1 === 0) {
                element.val(val.toFixed(decimal_places));
            } else if (String(val).split('.')[1].length != decimal_places) {
                element.val(val.toFixed(decimal_places));
            }
        }
    });
}
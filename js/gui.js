// GUI control object, storing current UI state, currently locked elements, etc
// Mode guide -
// 0 = disconnected (or "connection not established yet")
// 1 = normal operation (configurator)
// 2 = firmware flash mode
// 3 = spectrum analyzer mode
var GUI_control = function() {
    this.operating_mode = 0;
    this.connect_lock = false;
    this.tab_lock = new Array(4); // needs to match tab count
};

GUI_control.prototype.lock = function(index) {
    this.tab_lock[index] = 1;
};

GUI_control.prototype.unlock = function(index) {
    this.tab_lock[index] = 0;
};

GUI_control.prototype.lock_all = function(state) {
    if (state) { // lock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 1;
        }
    } else { // unlock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 0;
        }
    }
};

// initialize object into GUI variable
var GUI = new GUI_control();
'use strict';

// GUI control object, storing current UI state, currently locked elements, etc
// Mode guide -
// 0 = disconnected (or "connection not established yet")
// 1 = normal operation (configurator)
// 2 = firmware flash mode
// 3 = spectrum analyzer mode
function GUI_control() {
    this.auto_connect = false;
    this.disable_quickjoin = false;
    this.connecting_to = false;
    this.connected_to = false;
    this.bitrate = false;
    this.module = false;
    this.operating_mode = 0;
    this.connect_lock = false;
    this.tab_lock_default_state = [1, 1, 1, 1, 0, 0]; // needs to match tab count
    this.tab_lock = [];
    this.active_tab;
    this.operating_system;
    this.optional_usb_permissions = false; // controlled by usb permissions code
    this.interval_array = [];
    this.timeout_array = [];

    // initialize tab_lock array from tab_lock_defualt_state array data
    for (var i = 0; i < this.tab_lock_default_state.length; i++) {
        this.tab_lock[i] = this.tab_lock_default_state[i];
    }

    // check which operating system is user running
    if (navigator.appVersion.indexOf("Win") != -1)          this.operating_system = "Windows";
    else if (navigator.appVersion.indexOf("Mac") != -1)     this.operating_system = "MacOS";
    else if (navigator.appVersion.indexOf("CrOS") != -1)    this.operating_system = "ChromeOS";
    else if (navigator.appVersion.indexOf("Linux") != -1)   this.operating_system = "Linux";
    else if (navigator.appVersion.indexOf("X11") != -1)     this.operating_system = "UNIX";
    else this.operating_system = "Unknown";
}

// Tab managing methods


// target = tab index or class name
GUI_control.prototype.lock = function(target) {
    var index;

    if (!isNaN(target)) {
        index = target;
    } else {
        index = $('div#tabs').find('.' + target).index();
    }

    this.tab_lock[index] = 1;
    $('div#tabs li a').eq(index).removeClass('unlocked');
};

// target = tab index or class name
GUI_control.prototype.unlock = function(target) {
    var index;

    if (!isNaN(target)) {
        index = target;
    } else {
        index = $('div#tabs').find('.' + target).index();
    }

    this.tab_lock[index] = 0;
    $('div#tabs li a').eq(index).addClass('unlocked');
};

// state = true (lock all tabs)
// state = false (unlock all tabs)
GUI_control.prototype.lock_all = function(state) {
    var tabs = $('div#tabs li a');

    if (state) { // lock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 1;

            // remove unlocked indicators
            tabs.eq(i).removeClass('unlocked');
        }
    } else { // unlock all
        for (var i = 0; i < this.tab_lock.length; i++) {
            this.tab_lock[i] = 0;

            // apply unlocked indicators
            tabs.eq(i).addClass('unlocked');
        }
    }
};

// no input parameters
GUI_control.prototype.lock_default = function() {
    var tabs = $('div#tabs li a');

    for (var i = 0; i < this.tab_lock_default_state.length; i++) {
       this.tab_lock[i] = this.tab_lock_default_state[i];

       // apply locked / unlocked indicators
       if (this.tab_lock[i]) tabs.eq(i).removeClass('unlocked');
       else tabs.eq(i).addClass('unlocked');
    }

    return true;
};

// Timer managing methods

// name = string
// code = function reference (code to be executed)
// interval = time interval in miliseconds
// first = true/false if code should be ran initially before next timer interval hits
GUI_control.prototype.interval_add = function(name, code, interval, first) {
    var data = {'name': name, 'timer': undefined, 'code': code, 'interval': interval, 'fired': 0, 'paused': false};

    if (first == true) {
        code(); // execute code

        data.fired++; // increment counter
    }

    data.timer = setInterval(function() {
        code(); // execute code

        data.fired++; // increment counter
    }, interval);

    this.interval_array.push(data); // push to primary interval array

    return data;
};

// name = string
GUI_control.prototype.interval_remove = function(name) {
    for (var i = 0; i < this.interval_array.length; i++) {
        if (this.interval_array[i].name == name) {
            clearInterval(this.interval_array[i].timer); // stop timer

            this.interval_array.splice(i, 1); // remove element/object from array

            return true;
        }
    }

    return false;
};

// name = string
GUI_control.prototype.interval_pause = function(name) {
    for (var i = 0; i < this.interval_array.length; i++) {
        if (this.interval_array[i].name == name) {
            clearInterval(this.interval_array[i].timer);
            this.interval_array[i].paused = true;

            return true;
        }
    }

    return false;
};

// name = string
GUI_control.prototype.interval_resume = function(name) {
    for (var i = 0; i < this.interval_array.length; i++) {
        if (this.interval_array[i].name == name && this.interval_array[i].paused) {
            var obj = this.interval_array[i];

            obj.timer = setInterval(function() {
                obj.code(); // execute code

                obj.fired++; // increment counter
            }, obj.interval);

            obj.paused = false;

            return true;
        }
    }

    return false;
};

// input = array of timers thats meant to be kept, or nothing
// return = returns timers killed in last call
GUI_control.prototype.interval_kill_all = function(keep_array) {
    var self = this;
    var timers_killed = 0;

    for (var i = (this.interval_array.length - 1); i >= 0; i--) { // reverse iteration
        var keep = false;
        if (keep_array) { // only run through the array if it exists
            keep_array.forEach(function(name) {
                if (self.interval_array[i].name == name) {
                    keep = true;
                }
            });
        }

        if (!keep) {
            clearInterval(this.interval_array[i].timer); // stop timer

            this.interval_array.splice(i, 1); // remove element/object from array

            timers_killed++;
        }
    }

    return timers_killed;
};

// name = string
// code = function reference (code to be executed)
// timeout = timeout in miliseconds
GUI_control.prototype.timeout_add = function(name, code, timeout) {
    var self = this;
    var data = {'name': name, 'timer': undefined, 'timeout': timeout};

    // start timer with "cleaning" callback
    data.timer = setTimeout(function() {
        code(); // execute code

        // remove object from array
        var index = self.timeout_array.indexOf(data);
        if (index > -1) self.timeout_array.splice(index, 1);
    }, timeout);

    this.timeout_array.push(data); // push to primary timeout array

    return data;
};

// name = string
GUI_control.prototype.timeout_remove = function(name) {
    for (var i = 0; i < this.timeout_array.length; i++) {
        if (this.timeout_array[i].name == name) {
            clearTimeout(this.timeout_array[i].timer); // stop timer

            this.timeout_array.splice(i, 1); // remove element/object from array

            return true;
        }
    }

    return false;
};

// no input paremeters
// return = returns timers killed in last call
GUI_control.prototype.timeout_kill_all = function() {
    var timers_killed = 0;

    for (var i = 0; i < this.timeout_array.length; i++) {
        clearTimeout(this.timeout_array[i].timer); // stop timer

        timers_killed++;
    }

    this.timeout_array = []; // drop objects

    return timers_killed;
};

// message = string
GUI_control.prototype.log = function(message) {
    var command_log = $('div#log');
    var d = new Date();
    var time = ((d.getHours() < 10) ? '0' + d.getHours(): d.getHours())
        + ':' + ((d.getMinutes() < 10) ? '0' + d.getMinutes(): d.getMinutes())
        + ':' + ((d.getSeconds() < 10) ? '0' + d.getSeconds(): d.getSeconds());

    $('div.wrapper', command_log).append('<p>' + time + ' -- ' + message + '</p>');
    command_log.scrollTop($('div.wrapper', command_log).height());
};

// Method is called every time a valid tab change event is received
// callback = code to run when cleanup is finished
// default switch doesn't require callback to be set
GUI_control.prototype.tab_switch_cleanup = function(callback) {
    switch (this.active_tab) {
        case 'rx_connecting':
            if (CONFIGURATOR.connectingToRX) {
                // tell the rx_module code that we are leaving and no reconnecting routine needs to be ran
                tab_initialize_rx_module.leaving_tab = true;

                if (callback) PSP.callbacks.push({'code': PSP.PSP_REQ_RX_JOIN_CONFIGURATION, 'callback': callback});

                send([0x00]); // sending any data in this stage will "break" the timeout
            } else {
                if (callback) callback();
            }
            break;
        case 'signal_monitor':
            GUI.interval_remove('ppm_data_pull');
            $(window).unbind('resize');

            if (callback) callback();
            break;
        case 'spectrum_analyzer':
            if (GUI.module != 'RX') { // only execute while we are not connected to RX module
                GUI.interval_remove('SA_redraw_plot'); // disable plot re-drawing timer

                send("#1,,,,", function() { // #1,,,, (exit command)
                    GUI.operating_mode = 1; // configurator
                    if (callback) callback();
                });
            } else {
                if (callback) callback();
            }
            break;
        case 'firmware_uploader':
            GUI.operating_mode = 0;
            if (callback) callback();
            break;

        default:
            if (callback) callback();
    }
};

// initialize object into GUI variable
var GUI = new GUI_control();
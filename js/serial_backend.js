'use strict';

$(document).ready(function () {
    $('div#port-picker a.connect').click(function () {
        if (!GUI.connect_lock && GUI.operating_mode != 2) { // GUI control overrides the user control
            var clicks = $('div#port-picker a.connect').data('clicks');

            if (!clicks) {
                var selected_port = String($('div#port-picker .port select').val());
                var selected_baud = parseInt($('div#port-picker #baud').val());

                if (selected_port != '0') {
                    console.log('Connecting to: ' + selected_port + ', baud: ' + selected_baud);
                    // connecting_to is used in auto-connect to prevent auto-connecting while we are in the middle of connect procedure
                    GUI.connecting_to = selected_port;
                    GUI.bitrate = selected_baud;

                    // lock port select & baud while we are connecting / connected
                    $('div#port-picker #port, div#port-picker #baud').prop('disabled', true);
                    $('div#port-picker a.connect').text(chrome.i18n.getMessage('connecting'));

                    serial.connect(selected_port, {bitrate: selected_baud}, onOpen);

                    $('div#port-picker a.connect').data("clicks", !clicks);
                } else {
                    GUI.log(chrome.i18n.getMessage('error_no_valid_port'));
                }
            } else {
                GUI.timeout_kill_all();
                GUI.interval_kill_all();
                GUI.tab_switch_cleanup(); // Run cleanup routine for a selected tab (not using callback because hot-unplug wouldn't fire)
                PortHandler.flush_callbacks();

                // Send PSP_SET_EXIT after 50 ms (works with hot-unplug and normal disconnect)
                GUI.timeout_add('psp_exit', function () {
                    PSP.send_message(PSP.PSP_SET_EXIT);

                    // after 50ms (should be enough for PSP_SET_EXIT to trigger in normal disconnect), kill all timers, clean callbacks
                    // and disconnect from the port (works in hot-unplug and normal disconnect)
                    GUI.timeout_add('exit', function () {
                        PSP.disconnect_cleanup();
                        GUI.lock_default();
                        GUI.operating_mode = 0; // we are disconnected
                        GUI.module = false;
                        GUI.connecting_to = false;
                        GUI.connected_to = false;
                        GUI.bitrate = false;

                        if (serial.connectionId) serial.disconnect(onClosed); // connectionId could be false if user requests disconnect between 32u4 reboot sequence
                    }, 50);
                }, 50);

                $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');

                $('#tabs > ul li').removeClass('active'); // de-select any selected tabs

                // unlock port select & baud (if condition allows it)
                $('div#port-picker #port').prop('disabled', false);
                if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                // detach listeners and remove element data
                $('#content').empty();

                // load default html
                tab_initialize_default();

                $('div#port-picker a.connect').data("clicks", !clicks);
            }
        } else {
            if (GUI.operating_mode != 2) GUI.log(chrome.i18n.getMessage('error_operation_in_progress'));
            else GUI.log(chrome.i18n.getMessage('error_cannot_connect_while_in_firmware_flasher'));
        }
    });

    // auto-connect
    chrome.storage.local.get('auto_connect', function (result) {
        if (result.auto_connect === 'undefined' || result.auto_connect) {
            // default or enabled by user
            GUI.auto_connect = true;

            $('input.auto_connect').prop('checked', true);
            $('input.auto_connect').attr('title', chrome.i18n.getMessage('auto_connect_enabled'));
            $('select#baud').val(115200).prop('disabled', true);
        } else {
            // disabled by user
            GUI.auto_connect = false;

            $('input.auto_connect').prop('checked', false);
            $('input.auto_connect').attr('title', chrome.i18n.getMessage('auto_connect_disabled'));
        }

        // bind UI hook to auto-connect checkbos
        $('input.auto_connect').change(function () {
            GUI.auto_connect = $(this).is(':checked');

            // update title/tooltip
            if (GUI.auto_connect) {
                $('input.auto_connect').attr('title', chrome.i18n.getMessage('auto_connect_enabled'));

                $('select#baud').val(115200).prop('disabled', true);
            } else {
                $('input.auto_connect').attr('title', chrome.i18n.getMessage('auto_connect_disabled'));

                if (!GUI.connected_to && !GUI.connecting_to) $('select#baud').prop('disabled', false);
            }

            chrome.storage.local.set({'auto_connect': GUI.auto_connect});
        });
    });

    chrome.storage.local.get('disable_quickjoin', function (result) {
        if (typeof result.disable_quickjoin !== 'undefined') {
            GUI.disable_quickjoin = result.disable_quickjoin;
        }
    });

    PortHandler.initialize();
});

function onOpen(openInfo) {
    if (openInfo) {
        // store time for module startup speed tracking
        var port_opened_time = microtime();
        var time_of_disconnect = false;

        // update bitrate because selected bitrate might not be supported, and this is the real value that port was opened with
        GUI.bitrate = openInfo.bitrate;

        GUI.log(chrome.i18n.getMessage('serial_port_opened', [openInfo.connectionId]));

        // define inline functions first as some code below isn't asynchronous
        var check_for_32u4 = function () {
            if (GUI.optional_usb_permissions) {
                var check_usb_devices = function () {
                    chrome.usb.getDevices(usbDevices.atmega32u4, function (result) {
                        if (result.length > 0) {
                            detected_32u4_disconnect();
                        } else {
                            standard_connect_procedure();
                        }
                    });
                }

                var detected_32u4_disconnect = function () {
                    serial.disconnect(function (result) {
                        if (result) {
                            GUI.log(chrome.i18n.getMessage('serial_port_closed'));
                            GUI.log(chrome.i18n.getMessage('serial_atmega32u4_reboot_sequence_started'));

                            opening_port_at_1200();
                        } else {
                            failed_disconnect();
                        }
                    });
                }

                // opening port at 1200 baud rate, sending nothing, closing == mcu in programmer mode
                var opening_port_at_1200 = function () {
                    serial.connect(GUI.connecting_to, {bitrate: 1200}, function (openInfo) {
                        if (openInfo) {
                            closing_port_from_1200();
                        } else {
                            failed_connect();
                        }
                    });
                }

                var closing_port_from_1200 = function () {
                    serial.disconnect(function(result) {
                        if (result) {
                            wait_for_programming_port();
                        } else {
                            failed_disconnect();
                        }
                    });
                }

                var wait_for_programming_port = function () {
                    PortHandler.port_detected('port_handler_search_atmega32u4_prog_port', function (new_ports) {
                        if (new_ports) {
                            new_port_detected(new_ports);
                        } else {
                            failed_no_programming_port();
                        }
                    }, 8000);
                }

                var new_port_detected = function (new_ports) {
                    GUI.timeout_add('initialization_timeout', function () {
                        serial.connect(new_ports[0], {bitrate: 57600}, function (openInfo) {
                            if (openInfo) {
                                leave_programming_mode();
                            } else {
                                failed_connect();
                            }
                        });
                    }, 100); // timeout so bus have time to initialize after being detected by the system
                }

                var leave_programming_mode = function () {
                    // connected to programming port, send programming mode exit
                    var bufferOut = new ArrayBuffer(1);
                    var bufferView = new Uint8Array(bufferOut);

                    bufferView[0] = 0x45; // exit bootloader

                    // send over the actual data
                    serial.send(bufferOut, function (result) {
                        serial.disconnect(function (result) {
                            if (result) {
                                wait_for_regular_port();
                            } else {
                                failed_disconnect();
                            }
                        });
                    });
                }

                var wait_for_regular_port = function () {
                    // disconnected succesfully
                    time_of_disconnect = microtime();

                    // reset port open time as we had to execure reboot routine, so regular time wouldn't match
                    // setting port open time to the same as time of prog port disconnect is "wrong", but this is the most accurate
                    // tracker of "boot up" time we can get for the atmega32u4
                    port_opened_time = time_of_disconnect;

                    PortHandler.port_detected('port_handler_search_atmega32u4_regular_port', function (new_ports) {
                        if (new_ports) {
                            open_regular_port(new_ports);
                        } else {
                            failed_no_regular_port();
                        }
                    }, 10000);
                }

                var open_regular_port = function (new_ports) {
                    for (var i = 0; i < new_ports.length; i++) {
                        if (new_ports[i] == GUI.connecting_to) {
                            // port matches previously selected port, continue connection procedure
                            // open the port while mcu is starting
                            GUI.timeout_add('initialization_timeout', function () {
                                serial.connect(GUI.connecting_to, {bitrate: GUI.bitrate}, function (openInfo) {
                                    if (openInfo) {
                                        regular_port_opened(openInfo);
                                    } else {
                                        failed_disconnect();
                                    }
                                });
                            }, 100); // timeout so bus have time to initialize after being detected by the system

                            // Since we found what we were looking for, we won't continue
                            break;
                        }
                    }
                }

                var regular_port_opened = function (openInfo) {
                    GUI.log(chrome.i18n.getMessage('serial_port_opened', [openInfo.connectionId]));

                    // log delay between disconnecting from programming port and connecting to regular port
                    // If this time goes close or over 2 seconds, we have a problem, keep an eye on this one while
                    // changing timeouts for port handler, new version of arduino drivers, and keep in mind delays of slower machines
                    console.log('ATmega32u4 standard port caught in: ' + (microtime() - time_of_disconnect).toFixed(4) + ' seconds');

                    standard_connect_procedure();
                }

                var failed_connect = function () {
                    GUI.connecting_to = false;
                    // reset the connect button back to "disconnected" state
                    $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');
                    $('div#port-picker a.connect').data("clicks", false);

                    // unlock port select & baud (if condition allows it)
                    $('div#port-picker #port').prop('disabled', false);
                    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                    console.log('Failed to open serial port');
                    GUI.log(chrome.i18n.getMessage('error_failed_to_open_port'));
                }

                var failed_disconnect = function () {
                    GUI.connecting_to = false;

                    // reset the connect button back to "disconnected" state
                    $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');
                    $('div#port-picker a.connect').data("clicks", false);

                    // unlock port select & baud (if condition allows it)
                    $('div#port-picker #port').prop('disabled', false);
                    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                    console.log('Failed to close serial port');
                    GUI.log(chrome.i18n.getMessage('error_failed_to_close_port'));
                }

                var failed_no_programming_port = function () {
                    GUI.connecting_to = false;

                    // reset the connect button back to "disconnected" state
                    $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');
                    $('div#port-picker a.connect').data("clicks", false);

                    // unlock port select & baud (if condition allows it)
                    $('div#port-picker #port').prop('disabled', false);
                    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                    GUI.log(chrome.i18n.getMessage('error_atmega32u4_programmer_port_not_found'));
                }

                var failed_no_regular_port = function () {
                    GUI.connecting_to = false;

                    // reset the connect button back to "disconnected" state
                    $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');
                    $('div#port-picker a.connect').data("clicks", false);

                    // unlock port select & baud (if condition allows it)
                    $('div#port-picker #port').prop('disabled', false);
                    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

                    GUI.log(chrome.i18n.getMessage('error_atmega32u4_regular_port_not_found'));
                }

                // check if 32u4 is present
                check_usb_devices();
            } else {
                standard_connect_procedure();
            }
        };

        var standard_connect_procedure = function () {
            // we might consider to flush the receive buffer when dtr gets triggered (chrome.serial.flush is broken in API v 31)
            var startup_message_buffer = "";

            GUI.timeout_add('startup', function () {
                $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
                GUI.log(chrome.i18n.getMessage('error_no_startup_message'));
            }, 10000);

            serial.onReceive.addListener(function startup_listener(info) {
                var data = new Uint8Array(info.data);

                // run through the data/chars received
                for (var i = 0; i < data.length; i++) {
                    // only allow valid ASCII characters (0x1F <-> 0x7F) + line feed (0x0A)
                    if ((data[i] > 0x1F && data[i] < 0x7F) || data[i] == 0x0A) {
                        if (data[i] != 10) { // LF
                            startup_message_buffer += String.fromCharCode(data[i]);
                        } else {
                            if (startup_message_buffer != "" && startup_message_buffer.length > 2) { // empty lines and messages shorter then 2 chars get ignored here
                                GUI.log(chrome.i18n.getMessage('module_sent', [startup_message_buffer]));
                            }

                            // reset buffer
                            startup_message_buffer = "";
                        }

                        // compare buffer content "on the fly", this check is ran after each byte
                        if (startup_message_buffer == "OpenLRSng TX starting") {
                            GUI.timeout_remove('startup'); // make sure any further data gets processed by this timer
                            GUI.connected_to = GUI.connecting_to;
                            GUI.connecting_to = false;
                            GUI.module = 'TX';

                            // save last used port in local storage
                            chrome.storage.local.set({'last_used_port': GUI.connected_to});

                            // module is up, we have ~200 ms to join bindMode
                            console.log('OpenLRSng starting message received');
                            console.log('Module Started in: ' + (microtime() - port_opened_time).toFixed(4) + ' seconds');

                            GUI.log(chrome.i18n.getMessage('module_sent', [startup_message_buffer]));
                            GUI.log(chrome.i18n.getMessage('request_to_enter_bind_mode'));

                            // remove previous listener
                            serial.onReceive.removeListener(startup_listener);

                            // as neither BND! or B send any reply back, configurator doesn't know if mcu is in bind mode unless we get a reply from mcu with PSP_REQ_FW_VERSION
                            // we should always consider that joining bind mode failed and handle this condition accordingly.
                            send("BND!", function () { // Enter bind mode
                                GUI.timeout_add('binary_mode', function () {
                                    send("B", function () { // B char (to join the binary mode on the mcu)
                                        serial.onReceive.addListener(read_serial);

                                        PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function(result) {
                                            if (!result) {
                                                GUI.log(chrome.i18n.getMessage('error_no_psp_received'));
                                                console.log('Command: PSP.PSP_REQ_FW_VERSION timed out, connecting failed');

                                                // There is nothing we can do, disconnect
                                                $('div#port-picker a.connect').click();
                                            }
                                        }, 2500);
                                    });
                                }, 250); // 250 ms delay (after "OpenLRSng starting" message, mcu waits for 200ms and then reads serial buffer, afterwards buffer gets flushed)
                            });

                            return;
                        } else if (startup_message_buffer == "OpenLRSng RX starting") {
                            GUI.timeout_add('scanner_mode', function () { // wait max 100ms to receive scanner mode message, if not drop out
                                GUI.timeout_remove('startup'); // make sure any further data gets processed by this timer

                                // someone is trying to connect RX with configurator, set him on the correct path and disconnect
                                $('div#port-picker a.connect').click();

                                // tiny delay so all the serial messages are parsed to GUI.log and bus is disconnected
                                GUI.timeout_add('wrong_module', function () {
                                    GUI.log(chrome.i18n.getMessage('error_connecting_to_rx_to_configure'));
                                }, 100);
                            }, 100);
                        } else if (startup_message_buffer == "scanner mode") {
                            // if statement above checks for both "scanner mode message" and spectrum analyzer "sample" message which contains quite a few ","
                            // (|| startup_message_buffer.split(",").length >= 5) is currently disabled, which breaks non-dtr configurations
                            // as there seems to be some sort of receive buffer overflow (most likely on chrome side)
                            GUI.timeout_remove('startup');
                            GUI.timeout_remove('scanner_mode');
                            GUI.connected_to = GUI.connecting_to;
                            GUI.connecting_to = false;
                            GUI.module = 'RX';

                            // save last used port in local storage
                            chrome.storage.local.set({'last_used_port': GUI.connected_to});

                            // change connect/disconnect button from "connecting" status to disconnect
                            $('div#port-picker a.connect').text(chrome.i18n.getMessage('disconnect')).addClass('active');

                            // remove previous listener
                            serial.onReceive.removeListener(startup_listener);

                            GUI.operating_mode = 3; // spectrum analyzer
                            serial.onReceive.addListener(read_serial);
                            GUI.unlock('tab_spectrum_analyzer'); // unlock spectrum analyzer tab

                            // open SA tab
                            $('#tabs').find('.tab_spectrum_analyzer a').click();

                            return;
                        }
                    } else {
                        console.log('Garbage (ignored) on ASCII serial bus: ' + data[i]);
                    }
                }
            });
        };

        if (!GUI.disable_quickjoin) {
            // quick join (for modules that are already in bind mode and modules connected through bluetooth)
            serial.onReceive.addListener(read_serial);

            // using this timeout as protection against locked bus (most likely chrome serial api bug), if sending "B" fails
            // PSP callback with timeout trigger wouldn't trigger
            GUI.timeout_add('send_timeout', function () {
                GUI.log(chrome.i18n.getMessage('error_failed_to_enter_binary_mode'));

                // disconnect
                $('div#port-picker a.connect').click();
            }, 250);

            send("B", function() { // B char (to join the binary mode on the mcu), as it would appear this callback can fail
                PSP.send_message(PSP.PSP_REQ_FW_VERSION, false, false, function (result) {
                    GUI.timeout_remove('send_timeout');

                    if (result) {
                        console.log('Quick join success');
                        GUI.connected_to = GUI.connecting_to;
                        GUI.connecting_to = false;
                        GUI.module = 'TX';

                        // save last used port in local storage
                        chrome.storage.local.set({'last_used_port': GUI.connected_to});
                    } else {
                        console.log('Quick join expired');
                        serial.onReceive.removeListener(read_serial); // standard connect sequence uses its own listener

                        // continue
                        check_for_32u4();
                    }
                }, 200);
            });
        } else {
            check_for_32u4();
        }
    } else {
        // reset the connect button back to "disconnected" state
        $('div#port-picker a.connect').text(chrome.i18n.getMessage('connect')).removeClass('active');
        $('div#port-picker a.connect').data("clicks", false);

        // unlock port select & baud (if condition allows it)
        $('div#port-picker #port').prop('disabled', false);
        if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

        console.log('Failed to open serial port');
        GUI.log(chrome.i18n.getMessage('error_failed_to_open_port'));
    }
}

function onClosed(result) {
    if (result) { // All went as expected
        GUI.log(chrome.i18n.getMessage('serial_port_closed'));
    } else { // Something went wrong
        GUI.log(chrome.i18n.getMessage('error_failed_to_close_port'));
    }
}

function read_serial(info) {
    if (GUI.operating_mode == 0 || GUI.operating_mode == 1) { // configurator
        PSP.read(info);
    } else if (GUI.operating_mode == 3) { // spectrum analyzer
        SA.read(info);
    }
}

// send is accepting both array and string inputs
function send(data, callback) {
    var bufferOut = new ArrayBuffer(data.length),
        bufferView = new Uint8Array(bufferOut);

    if (typeof data == 'object') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i];
        }
    } else if (typeof data == 'string') {
        for (var i = 0; i < data.length; i++) {
            bufferView[i] = data[i].charCodeAt(0);
        }
    }

    serial.send(bufferOut, function(writeInfo) {
        if (writeInfo.bytesSent == bufferOut.byteLength) {
            if (callback) {
                callback();
            }
        }
    });
}
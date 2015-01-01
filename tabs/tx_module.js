'use strict';

function tab_initialize_tx_module() {
    var min_frequency,
        max_frequency,
        max_used_frequency,
        custom_hopchannel_list_valid,
        new_hopchannel_array;

    function generate_info() {
        var data_rates = new Array(4800, 9600, 19200, 57600, 125000),
            packet_sizes = new Array(7, 11, 12, 16, 17, 21),
            channel_config = parseInt($('select[name="channel_config"]').val()),
            data_rate = parseInt($('select[name="data_rate"]').val()),
            packet_overhead = 15,
            ms;

        if (parseInt($('select[name="enable_diversity"]').val()) >= 1) {
            packet_overhead = 20;
        }

        ms = ((packet_sizes[channel_config - 1] + packet_overhead) * 8200000) / data_rates[data_rate] + 2000;

        if (parseInt($('select[name="telemetry"]').val()) >= 1) {
            ms += (((9 + packet_overhead) * 8200000) / data_rates[data_rate]) + 1000;
        }

        ms = ((ms + 999) / 1000) * 1000;

        $('.packet_interval').html(ms.toFixed(0) + ' &#181;s');
        $('.refresh_rate').text((1000000 / ms).toFixed(0) + ' Hz');
    }

    function generate_hop_channels_list() {
        // List actual hop frequencies (base frequency + hopchannel * channel spacing * 10kHz = actual channel frequency)
        var base_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000),
            channel_spacing = parseInt($('input[name="channel_spacing"]').val()),
            hopcount = parseInt($('input[name="hopcount"]').val()),
            maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000),
            valid_frequency_array = [];

        // reset variables
        max_used_frequency = 0;

        min_frequency = (base_frequency + 1 * channel_spacing * 10000) / 1000; // channel 1
        $('div.hop_channels .list').empty(); // delete previous list

        for (var i = 0; i < hopcount; i++) {
            var output = (base_frequency + BIND_DATA.hopchannel[i] * channel_spacing * 10000) / 1000; // kHz

            $('div.hop_channels .list').append('<input class="chan_value" name="chan_value" type="number" \
                title="' + chrome.i18n.getMessage('tx_module_hopchannel_title', [i + 1, BIND_DATA.hopchannel[i], output]) + '" \
                min="' + min_frequency + '" max="TBD" step="' + (channel_spacing * 10) + '" \
                value="' + output + '"/>');
            if (BIND_DATA.hopchannel[i] == 0) {
                // hopchannel for this hop couldn't be generated (desired frequency range is too small), all of the failed chanells will be visually marked as red
                $('div.hop_channels .list input.chan_value:last').addClass('validation_failed');
            }

            // check maximum used frequency
            if (max_used_frequency < output) {
                max_used_frequency = output;
            }
        }

        // Update Max Used Frequency
        $('.maximum_frequency').text(max_used_frequency + ' kHz');

        // generate valid frequency array (required for "proper" max_frequency)
        for (var i = 1; i < 256; i++) { // starting at first channel
            var output = (base_frequency + i * channel_spacing * 10000) / 1000; // kHz

            if (output > (maximum_desired_frequency / 1000)) {
                // break on hitting the maximum frequency desired by the user
                break;
            }

            valid_frequency_array.push(output);
        }

        max_frequency = Math.max.apply(null, valid_frequency_array); // highest channel
        $('div.hop_channels .list input').prop('max', max_frequency); // update all input fields with highest possible value


        // bind UI hooks for newly generated list
        $('div.hop_channels .list input').change(function () {
            var self = this,
                channel = (parseInt($(self).val()) - parseInt($('input[name="operating_frequency"]').val())) / parseInt($(self).prop('step')),
                chanvalue_validation = true,
                base_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000),
                channel_spacing = parseInt($('input[name="channel_spacing"]').val()),
                maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000),
                valid_frequency_array = [];

            // update title with latest value
            $(self).prop('title', chrome.i18n.getMessage('tx_module_hopchannel_title', [$(self).index() + 1, channel, $(self).val()]));

            // Validation
            custom_hopchannel_list_valid = false;

            // 1. chanel value validation
            // generate valid frequency array
            for (var i = 1; i < 256; i++) { // starting at first channel
                var output = (base_frequency + i * channel_spacing * 10000) / 1000; // kHz

                if (output > (maximum_desired_frequency / 1000)) {
                    // break on hitting the maximum frequency desired by the user
                    break;
                }

                valid_frequency_array.push(output);
            }

            // generate new hopchannel array while validating the frequency against valid frequency array
            new_hopchannel_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array
            $('div.hop_channels .list input.chan_value').each(function () {
                var val = parseInt($(this).val()),
                    index = $(this).index();

                if (valid_frequency_array.indexOf(val) != -1) {
                    // valid
                    new_hopchannel_array[index] = (parseInt($(this).val()) - parseInt($('input[name="operating_frequency"]').val())) / parseInt($(this).prop('step'));

                    $(this).removeClass('validation_failed');
                } else {
                    // invalid
                    $(this).addClass('validation_failed');
                    chanvalue_validation = false;
                }
            });

            // 2. value duplicity validation
            if (chanvalue_validation) {
                var channel_duplicity_validation = true,
                    temp_array = [];

                $('div.hop_channels .list input.chan_value').each(function () {
                    var val = parseInt($(this).val());

                    for (var i = 0; i < temp_array.length; i++) {
                        if (temp_array[i] == val) {
                            // match found, failed
                            channel_duplicity_validation = false;
                            $(this).addClass('validation_failed');
                            break;
                        }
                    }

                    if (channel_duplicity_validation) {
                        temp_array.push(val);
                        $(this).removeClass('validation_failed');
                    }
                });
            }

            // all is good, replace arrays
            if (channel_duplicity_validation) {
                custom_hopchannel_list_valid = true;
            }
        });
    }

    function randomize_hopchannels() {
        var number_of_hops = parseInt($('input[name="hopcount"]').val()),
            maximum_desired_frequency = parseInt($('input[name="maximum_desired_frequency"]').val() * 1000),
            base_fequency = parseInt($('input[name="operating_frequency"]').val() * 1000),
            channel_spacing = parseInt($('input[name="channel_spacing"]').val()),
            maximum_desired_channel = 0,
            randomization_array = [];

        // every time hop count is changed, hopchannel array will be reinitialized with new random values
        BIND_DATA.hopchannel = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // blank 24 field array

        // find channel limit
        for (var i = 0; i < 256; i++) { // 255 = maximum
            maximum_desired_channel++;

            var real_frequency = (base_fequency + maximum_desired_channel * channel_spacing * 10000);

            if ((maximum_desired_channel == 255) || (real_frequency > maximum_desired_frequency)) {
                if (real_frequency > maximum_desired_frequency) {
                    // we went overboard, correct the problem
                    maximum_desired_channel--;
                }
                break;
            }
        }

        // announce limit
        console.log('HopChannel limit set to: ' + maximum_desired_channel);

        // generate randomization array
        for (var i = 1; i < maximum_desired_channel; i++) {
            randomization_array.push(i);
        }

        // fill hopchannel array with desired number of hops
        if (randomization_array.length) { // only execute if there are channels to assign
            for (var i = 0; i < number_of_hops; i++) {
                var random_number = getRandomInt(0, randomization_array.length - 1);
                BIND_DATA.hopchannel[i] = randomization_array.splice(random_number, 1)[0];

                // if we used up all possible channels, break
                if (randomization_array.length == 0) {
                    break;
                }
            }
        }

        // refresh info view
        generate_hop_channels_list();
    }

    function validate_and_save_to_eeprom(use_random_rf_magic, callback) {
        // fire change event on hop_channel list elemets to run custom_hop_list validation
        $('div.hop_channels .list input:first').change();

        if (custom_hopchannel_list_valid) {
            BIND_DATA.hopchannel = new_hopchannel_array; // update hopchannel with current "custom" hopchannel array

            // Basic settings
            // we need to "grasp" all values from the UI, store it in the local BIND_DATA object
            // send this object to the module and then request EEPROM save
            BIND_DATA.rf_frequency = parseInt($('input[name="operating_frequency"]').val() * 1000);
            BIND_DATA.rf_power = parseInt($('input[name="rf_power"]').val());
            BIND_DATA.rf_channel_spacing = parseInt($('input[name="channel_spacing"]').val());
            BIND_DATA.serial_baudrate = parseInt($('select[name="serial_baudrate"]').val());
            BIND_DATA.modem_params = parseInt($('select[name="data_rate"]').val());

            // combine flag values
            var bind_flags = parseInt($('select[name="channel_config"]').val());

            if (parseInt($('select[name="telemetry"]').val()) == 1) {
                // telemetry ON
                bind_flags |= 0x08;
            } else if (parseInt($('select[name="telemetry"]').val()) == 2) {
                // telemetry FRSKY
                bind_flags |= 0x10;
            } else if (parseInt($('select[name="telemetry"]').val()) == 3) {
                // telemetry smartPort
                bind_flags |= 0x18;
            }

            if (parseInt($('select[name="enable_diversity"]').val()) == 1) {
                bind_flags |= 0x80;
            }

            if (parseInt($('select[name="silent_buzzer"]').val()) == 1) {
                TX_CONFIG.flags = bit_set(TX_CONFIG.flags, 4);
            } else {
                TX_CONFIG.flags = bit_clear(TX_CONFIG.flags, 4);
            }

            if (parseInt($('select[name="alt_power"]').val()) == 1) {
                TX_CONFIG.flags = bit_set(TX_CONFIG.flags, 3);
            } else {
                TX_CONFIG.flags = bit_clear(TX_CONFIG.flags, 3);
            }

            if (parseInt($('select[name="sw_power"]').val()) == 1) {
                TX_CONFIG.flags = bit_set(TX_CONFIG.flags, 2);
            } else {
                TX_CONFIG.flags = bit_clear(TX_CONFIG.flags, 2);
            }

            // store new flags in BIND_DATA object
            BIND_DATA.flags = bind_flags;

            TX_CONFIG.max_frequency = parseInt($('input[name="maximum_desired_frequency"]').val()) * 1000;

            // Advanced settings
            // rf_magic is randomized every time settings are saved
            // rf_magic randomization is disabled while cloning profiles
            if (use_random_rf_magic) {
                BIND_DATA.rf_magic = getRandomInt(116548, 4294967295);
            } else {
                BIND_DATA.rf_magic = parseInt($('input.bind_code').val(), 16);

                if (BIND_DATA.rf_magic < 116548 || BIND_DATA.rf_magic > 4294967295) {
                    // rf_magic is not within valid range, generate new one
                    BIND_DATA.rf_magic = getRandomInt(116548, 4294967295);
                }
            }

            // update UI with latest rf_magic
            $('input.bind_code').val(BIND_DATA.rf_magic.toString(16).toUpperCase());

            PSP.send_config('TX');

            if (callback) callback(true);
        } else {
            GUI.log(chrome.i18n.getMessage('tx_module_validation_failed_line_1'));
            GUI.log(chrome.i18n.getMessage('tx_module_validation_failed_line_2'));

            if (callback) callback(false);
        }
    }

    // load the html UI and set all the values according to received configuration data
    $('#content').load("./tabs/tx_module.html", function () {
        if (GUI.active_tab != 'tx_module') {
            GUI.active_tab = 'tx_module';
            googleAnalytics.sendAppView('TX Module');
        }

        // translate to user-selected language
        localize();

        var hopcount = 0;

        validate_bounds('input[type="number"]');

        // Basic settings
        // default profile
        $('select[name="default_profile"]').val(CONFIGURATOR.defaultProfile);
        $('select[name="default_profile"]').change(function () {
            CONFIGURATOR.defaultProfile = parseInt($(this).val());
            PSP.send_message(PSP.PSP_SET_DEFAULT_PROFILE, CONFIGURATOR.defaultProfile, false, function () {
                GUI.log(chrome.i18n.getMessage('tx_module_default_profile_updated'));
            });
        });
        // profile
        $('select[name="profile"]').val(CONFIGURATOR.activeProfile);
        $('select[name="profile"]').change(function () {
            var profile = parseInt($(this).val());

            GUI.log(chrome.i18n.getMessage('tx_module_requesting_profile', [profile + 1]));

            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function () {
                // profile switched on the MCU side, pull data corresponding to this profile
                CONFIGURATOR.activeProfile = profile; // we don't need to request activeProfile as we know the value already

                PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_bind_data);

                function get_bind_data() {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, tab_initialize_tx_module);
                }
            });
        });

        $('input[name="maximum_desired_frequency"]').val((TX_CONFIG.max_frequency / 1000).toFixed(0));

        // set bounds
        initializeFrequencyLimits(TX_CONFIG.rfm_type);

        $('input[name="operating_frequency"]').prop('min', frequencyLimits.min / 1000);
        $('input[name="operating_frequency"]').prop('max', frequencyLimits.max / 1000);

        $('input[name="maximum_desired_frequency"]').prop('min', frequencyLimits.min / 1000);
        $('input[name="maximum_desired_frequency"]').prop('max', frequencyLimits.max / 1000);

        $('input[name="operating_frequency"]').val(BIND_DATA.rf_frequency / 1000); // parsing from HZ to kHz
        $('input[name="rf_power"]').val(BIND_DATA.rf_power);
        $('input[name="channel_spacing"]').val(BIND_DATA.rf_channel_spacing);
        $('select[name="serial_baudrate"]').val(BIND_DATA.serial_baudrate);
        $('select[name="data_rate"]').val(BIND_DATA.modem_params);

        switch (TX_CONFIG.rfm_type) {
            case 0:
                $('div.info span.rfm_type').text('433 MHz');
                break;
            case 1:
                $('div.info span.rfm_type').text('868 MHz');
                break;
            case 2:
                $('div.info span.rfm_type').text('915 MHz');
                break;
            default:
                $('div.info span.rfm_type').text('Unknown');
        }

        if (bit_check(BIND_DATA.flags, 3)) {
            // telemetry ON
            $('select[name="telemetry"]').val(1);
        }

        if (bit_check(BIND_DATA.flags, 4)) {
            // telemetry FRSKY
            $('select[name="telemetry"]').val(2);
        }

        if (bit_check(BIND_DATA.flags, 3) && bit_check(BIND_DATA.flags, 4)) {
            // telemetry smartPort
            $('select[name="telemetry"]').val(3);
        }

        if (bit_check(BIND_DATA.flags, 7)) {
            // Enable diversity
            $('select[name="enable_diversity"]').val(1);
        }

        if (bit_check(TX_CONFIG.flags, 7)) { // watchdog
            $('div.info span.watchdog').text(chrome.i18n.getMessage('tx_module_enabled'));
        } else {
            $('div.info span.watchdog').text(chrome.i18n.getMessage('tx_module_disabled'));
        }

        if (bit_check(TX_CONFIG.flags, 4)) {
            // mute buzzer
            $('select[name="silent_buzzer"]').val(1);
        }

        if (bit_check(TX_CONFIG.flags, 3)) {
            // alternating power
            $('select[name="alt_power"]').val(1);
        }

        if (bit_check(TX_CONFIG.flags, 2)) {
            // switchable power
            $('select[name="sw_power"]').val(1);
        }

        // ignore flipped bits 3-7 (this needs to be increased in case flag size changes from 8 bits to something bigger)
        $('select[name="channel_config"]').val(BIND_DATA.flags & ~0xF8);

        // Advanced settings
        // Calculate number of hop channels
        for (var i = 0; i < 24; i++) {
            if (BIND_DATA.hopchannel[i] != 0) {
                hopcount++;
            }
        }

        $('input[name="hopcount"]').val(hopcount);

        // Info / Hop Channels
        generate_info();
        generate_hop_channels_list();

        $('input.bind_code').val(BIND_DATA.rf_magic.toString(16).toUpperCase());

        // lock / unlock checkbox + input for bind_code according to saved data
        chrome.storage.local.get('manual_bind_code', function (result) {
            if (typeof result.manual_bind_code !== 'undefined') {
                if (result.manual_bind_code) {
                    $('input.bind_code').prop('disabled', false);
                    $('input.automatic_bind_code').prop('checked', false);
                } else {
                    $('input.bind_code').prop('disabled', true);
                    $('input.automatic_bind_code').prop('checked', true);
                }
            } else {
                // wasn't saved yet, default settings will be kept (automatic random bind code enabled)
            }

            // bind UI hooks for the checkbox
            $('input.automatic_bind_code').change(function () {
                var state;

                if ($(this).is(':checked')) {
                    state = false;
                    $('input.bind_code').prop('disabled', true);
                } else {
                    state = true;
                    $('input.bind_code').prop('disabled', false);
                }

                chrome.storage.local.set({'manual_bind_code': state}, function () {});
            });
        });

        // UI hooks
        $('a.clone_profile').click(function() {
            var initial_profile = parseInt($('select[name="profile"]').val()),
                profiles_saved = 0;

            function save_profile(profile) {
                GUI.log(chrome.i18n.getMessage('tx_module_selecting_profile', [profile + 1]));

                PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, profile, false, function () {
                    PSP.send_config('TX', function () {
                        if (profiles_saved < 4) {
                            save_profile(profiles_saved++);
                        } else {
                            GUI.log(chrome.i18n.getMessage('tx_module_selecting_profile', [initial_profile + 1]));

                            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, initial_profile, false, function () {
                                // profile switched on the MCU side, pull data corresponding to this profile
                                CONFIGURATOR.activeProfile = initial_profile; // we don't need to request activeProfile as we know the value already

                                PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_bind_data);

                                function get_bind_data() {
                                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, tab_initialize_tx_module);
                                }
                            });
                        }
                    });
                });
            }

            validate_and_save_to_eeprom(false, function (result) {
                if (result) save_profile(profiles_saved++);
            });
        });

        $('select[name="data_rate"], select[name="telemetry"], select[name="channel_config"], select[name="enable_diversity"]').change(function () {
            if ($(this).prop('name') == 'data_rate' && parseInt($(this).val()) == 4) {
                // set channel spacing of 25 while using 115k data rate (also fire change event)
                $('input[name="channel_spacing"]').val(25).change();
            }

            generate_info();
        });

        $('input[name="channel_spacing"]').change(function () {
            if (parseInt($('select[name="data_rate"]').val()) == 4 && parseInt($(this).val()) < 25) {
                // enforce channel spacing of 25 while using 115k data rate (no change event fired)
                $(this).val(25);
            } else {
                generate_hop_channels_list();
                $('div.hop_channels .list input:first').change(); // run validation
            }
        });

        $('input[name="operating_frequency"], input[name="hopcount"]').change(randomize_hopchannels);

        $('a.randomize').click(randomize_hopchannels);

        $('input[name="maximum_desired_frequency"]').change(randomize_hopchannels);

        // restore from file
        $('a.restore_from_file').click(function () {
            restore_from_file(function (result) {
                if (result.type == 'TX_single_profile_backup' || result.type == 'TX_all_profiles_backup') {
                    // validate object properties and object lengths (TODO: tx_config validation)
                    var valid = true;

                    outter_loop:
                    for (var property in BIND_DATA) {
                        for (var i = 0; i < result.obj[0].bind_data.length; i++) {
                            if (!result.obj[i].bind_data.hasOwnProperty(property)) {
                                valid = false;
                                break outter_loop;
                            }
                        }
                    }

                    for (var i = 0; i < result.obj[0].bind_data.length; i++) {
                        if (Object.keys(BIND_DATA).length != Object.keys(result.obj[i].bind_data).length) {
                            valid = false;
                            break;
                        }
                    }

                    if (valid) {
                        var current_profile = CONFIGURATOR.activeProfile,
                            saving_profile = 0,
                            profiles = result.obj;

                        if (profiles.length > 1) {
                            // restore all profiles
                            var save_data_loop = function () {
                                GUI.log(chrome.i18n.getMessage('tx_module_uploading_profile', [saving_profile + 1]));

                                PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, saving_profile, false, function () {
                                    TX_CONFIG = profiles[saving_profile].tx_config;
                                    BIND_DATA = profiles[saving_profile].bind_data;

                                    saving_profile++;

                                    PSP.send_config('TX', function() {
                                        if (saving_profile < 4) {
                                            save_data_loop();
                                        } else {
                                            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile, false, get_tx_config);

                                            var get_tx_config = function () {
                                                PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_bind_data);
                                            }

                                            var get_bind_data = function () {
                                                PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function () {
                                                    GUI.log(chrome.i18n.getMessage('tx_module_configuration_restored_from_file'));
                                                    // new data received, re-initialize values in current tab
                                                    tab_initialize_tx_module();
                                                });
                                            }
                                        }
                                    });
                                });
                            };

                            save_data_loop();
                        } else {
                            // restore single profile
                            GUI.log(chrome.i18n.getMessage('tx_module_uploading_profile', [current_profile + 1]));

                            TX_CONFIG = profiles[0].tx_config;
                            BIND_DATA = profiles[0].bind_data;

                            PSP.send_config('TX', function() {
                                // we need to refresh UI with latest values that came from the backup file
                                PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_bind_data);

                                function get_bind_data() {
                                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function () {
                                        GUI.log(chrome.i18n.getMessage('tx_module_configuration_restored_from_file'));
                                        // new data received, re-initialize values in current tab
                                        tab_initialize_tx_module();
                                    });
                                }
                            });

                        }
                    } else {
                        GUI.log(chrome.i18n.getMessage('tx_module_data_structure_invalid'));
                        GUI.log(chrome.i18n.getMessage('tx_module_backup_generated_on', [result.configurator_version, read_firmware_version(result.firmware_version).str]));
                        GUI.log(chrome.i18n.getMessage('tx_module_current_configurator_version', [chrome.runtime.getManifest().version, CONFIGURATOR.firmwareVersionEmbedded[0] + '.' + CONFIGURATOR.firmwareVersionEmbedded[1] + '.' + CONFIGURATOR.firmwareVersionEmbedded[2]]));
                    }
                } else {
                    GUI.log(chrome.i18n.getMessage('tx_module_data_corrupted'));
                }
            });
        });

        // backup single (this) profile
        $('a.backup_single_profile').click(function () {
            var profile_array = [];

            // make a deep copy
            var wrapper_obj = {
                tx_config: $.extend(true, {}, TX_CONFIG),
                bind_data: $.extend(true, {}, BIND_DATA)
            };
            profile_array.push(wrapper_obj);

            save_object_to_file(profile_array, 'TX_single_profile_backup', function (result) {
                GUI.log(chrome.i18n.getMessage('tx_module_configuration_saved'));
            });
        });

        // backup all profiles
        $('a.backup_all_profiles').click(function () {
            var current_profile = CONFIGURATOR.activeProfile;
                getting_profile = 0,
                profile_array = [];

            function get_data_loop() {
                GUI.log(chrome.i18n.getMessage('tx_module_requesting_profile', [getting_profile + 1]));

                PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, getting_profile, false, get_tx_config);

                function get_tx_config() {
                    PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_bind_data);
                }

                function get_bind_data() {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, function () {
                        // make a deep copy
                        var wrapper_obj = {
                            tx_config: $.extend(true, {}, TX_CONFIG),
                            bind_data: $.extend(true, {}, BIND_DATA)
                        };
                        profile_array.push(wrapper_obj);

                        getting_profile++;

                        if (getting_profile < 4) {
                            get_data_loop();
                        } else {
                            // we have all profiles, reset to previous state
                            PSP.send_message(PSP.PSP_SET_ACTIVE_PROFILE, current_profile);

                            save_object_to_file(profile_array, 'TX_all_profiles_backup', function (result) {
                                GUI.log(chrome.i18n.getMessage('tx_module_configuration_saved'));
                            });
                        }
                    });
                }
            }

            get_data_loop();
        });

        // restore to default
        $('a.restore_default').click(function () {
            if (!CONFIGURATOR.readOnly) {
                var get_tx_config = function () {
                    PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_active_profile);
                }

                var get_active_profile = function () {
                    PSP.send_message(PSP.PSP_REQ_ACTIVE_PROFILE, false, false, get_bind_data);
                }

                var get_bind_data = function () {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, tab_initialize_tx_module);
                }

                PSP.send_message(PSP.PSP_SET_TX_RESTORE_DEFAULT, false, false, get_tx_config);
            } else {
                GUI.log(chrome.i18n.getMessage('running_in_compatibility_mode'));
            }
        });

        // save to eeprom
        $('a.save_to_eeprom').click(function () {
            if ($('input.automatic_bind_code').is(':checked')) {
                // automatic bind code
                validate_and_save_to_eeprom(true);
            } else {
                // manual bind code
                validate_and_save_to_eeprom(false);
            }
        });
    });
}

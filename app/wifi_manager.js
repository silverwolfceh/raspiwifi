var _       = require("underscore")._,
    async   = require("async"),
    fs      = require("fs"),
    exec    = require("child_process").exec,
    config  = require("../config.json");

// Better template format
_.templateSettings = {
    interpolate: /\{\{(.+?)\}\}/g,
    evaluate :   /\{\[([\s\S]+?)\]\}/g
};

// Helper function to write a given template to a file based on a given
// context
function write_template_to_file(template_path, file_name, context, callback) {
    async.waterfall([

        function read_template_file(next_step) {
            fs.readFile(template_path, {encoding: "utf8"}, next_step);
        },

        function update_file(file_txt, next_step) {
            var template = _.template(file_txt);
            fs.writeFile(file_name, template(context), next_step);
        }

    ], callback);
}

/*****************************************************************************\
    Return a set of functions which we can use to manage and check our wifi
    connection information
\*****************************************************************************/
module.exports = function() {
    // Detect which wifi driver we should use, the rtl871xdrv or the nl80211
    exec("iw list", function(error, stdout, stderr) {
        if (stderr.match(/^nl80211 not found/)) {
            config.wifi_driver_type = "rtl871xdrv";
        }
    });

    // Define some globals
    var ifconfig_fields = {
        "hw_addr":         /HWaddr\s([^\s]+)/,
        "inet_addr":       /inet\s([^\s]+)/,
    },  iwconfig_fields = {
        "ap_addr":         /Access Point:\s([^\s]+)/,
        "ap_ssid":         /ESSID:\"([^\"]+)\"/,
        "unassociated":    /(unassociated)\s+Nick/,
    },  last_wifi_info = null
     , last_eth_info = null;

    // TODO: rpi-config-ap hardcoded, should derive from a constant
    var _get_eth_info = function(callback) {
        var output = {
            hw_addr:      "<unknown>",
            inet_addr:    "<unknown>"
        };
        function run_command_and_set_fields(cmd, fields, callback) {
            exec(cmd, function(error, stdout, stderr) {
                if (error) return callback(error);
                for (var key in fields) {
                    re = stdout.match(fields[key]);
                    if (re && re.length > 1) {
                        console.log("Receive: " + key + " => " + re[1]);
                        output[key] = re[1];
                    }
                }
                callback(null);
            });
        }

        async.series([
            function run_ifconfig(next_step)
            {
                run_command_and_set_fields("ifconfig eth0", ifconfig_fields, next_step);
            }
        ], function(error) {
            last_eth_info = output;
            return callback(error, output);
        });
    };
    // Get generic info on an interface
    var _get_wifi_info = function(callback) {
        var output = {
            hw_addr:      "<unknown>",
            inet_addr:    "<unknown>",
            ap_addr:      "<unknown_ap>",
            ap_ssid:      "<unknown_ssid>",
            unassociated: "<unknown>",
        };

        // Inner function which runs a given command and sets a bunch
        // of fields
        function run_command_and_set_fields(cmd, fields, callback) {
            exec(cmd, function(error, stdout, stderr) {
                if (error) return callback(error);
                for (var key in fields) {
                    re = stdout.match(fields[key]);
                    if (re && re.length > 1) {
                        console.log("Receive: " + key + " => " + re[1]);
                        output[key] = re[1];
                    }
                }
                callback(null);
            });
        }

        // Run a bunch of commands and aggregate info
        async.series([
            function run_ifconfig(next_step) {
                run_command_and_set_fields("ifconfig " + config.wifi_interface, ifconfig_fields, next_step);
            },
            function run_iwconfig(next_step) {
                run_command_and_set_fields("iwconfig " + config.wifi_interface, iwconfig_fields, next_step);
            },
        ], function(error) {
            last_wifi_info = output;
            return callback(error, output);
        });
    },

    _reboot_wireless_network = function(wlan_iface, callback) {
        async.series([
            function ifdown(next_step) {
                exec("sudo ifdown " + wlan_iface , function(error, stdout, stderr) {
                    if (!error) console.log("ifdown " + wlan_iface + " successful...");
                    next_step();
                });
            },
            function ipdown(next_step) {
                exec("sudo ip link set " + wlan_iface + " down", function(error, stdout, stderr) {
                    if(!error) console.log("IP link down successful...");
                    next_step();
                });
            },
            function ifup(next_step) {
                exec("sudo ifup --force " + wlan_iface , function(error, stdout, stderr) {
                    if (!error) console.log("ifup " + wlan_iface + " successful...");
                    next_step();
                });
            },
            function ipup(next_step) {
                exec("sudo ip link set " + wlan_iface + " up", function(error, stdout, stderr) {
                    if(!error) console.log("IP link up successful...");
                    next_step();
                })
            }
        ], callback);
    },

    // Wifi related functions
    _is_wifi_enabled_sync = function(info) {
        // If we are not an AP, and we have a valid
        // inet_addr - wifi is enabled!
        if (null        == _is_ap_enabled_sync(info) &&
            "<unknown>" != info["inet_addr"]         &&
            "<unknown>" == info["unassociated"] ) {
            return info["inet_addr"];
        }
        return null;
    },

    _is_wifi_enabled = function(callback) {
        _get_wifi_info(function(error, info) {
            if (error) return callback(error, null);
            return callback(null, _is_wifi_enabled_sync(info));
        });
    },

    _is_eth_enabled_sync = function(info) {
        if("<unknown>" != info["inet_addr"])
            return info["inet_addr"];
        return null;
    },

    _is_ethernet_enabled = function(callback) {
        _get_eth_info(function(error, info) {
            if(error) return callback(error, null);
            return callback(null, _is_eth_enabled_sync(info));
        });
    },

    // Access Point related functions
    _is_ap_enabled_sync = function(info) {
        // If the current IP assigned to the chosen wireless interface is
        // the one specified for the access point in the config, we are in
        // access-point mode. 
        // var is_ap  =
        //     info["inet_addr"].toLowerCase() == info["ap_addr"].toLowerCase() &&
        //     info["ap_ssid"] == config.access_point.ssid;
        // NOTE: I used to detect this using the "ESSID" and "Access Point"
        //       members from if/iwconfig.  These have been removed when the
        //       interface is running as an access-point itself.  To cope with
        //       this we are taking the simple way out, but at the cost that
        //       if you join a wifi network with the same subnet, you could
        //       collide and have the pi think that it is still in AP mode.
        var is_ap = info["inet_addr"] == config.access_point.ip_addr;
        return (is_ap) ? info["inet_addr"].toLowerCase() : null;
    },

    _is_ap_enabled = function(callback) {
        _get_wifi_info(function(error, info) {
            if (error) return callback(error, null);
            return callback(null, _is_ap_enabled_sync(info));
        });
    },

    // Enables the accesspoint w/ bcast_ssid. This assumes that both
    // isc-dhcp-server and hostapd are installed using:
    // $sudo npm run-script provision
    _enable_ap_mode = function(bcast_ssid, callback) {
        _is_ap_enabled(function(error, result_addr) {
            if (error) {
                console.log("ERROR: " + error);
                return callback(error);
            }

            if (result_addr && !config.access_point.force_reconfigure) {
                console.log("\nAccess point is enabled with ADDR: " + result_addr);
                return callback(null);
            } else if (config.access_point.force_reconfigure) {
                console.log("\nForce reconfigure enabled - reset AP");
            } else {
                console.log("\nAP is not enabled yet... enabling...");
            }

            var context = config.access_point;
            context["enable_ap"] = true;
            context["wifi_driver_type"] = config.wifi_driver_type;

            // Here we need to actually follow the steps to enable the ap
            async.series([

                // Enable the access point ip and netmask + static
                // DHCP for the wlan0 interface
                function update_interfaces(next_step) {
                    write_template_to_file(
                        "./assets/etc/network/interfaces.ap.template",
                        "/etc/network/interfaces",
                        context, next_step);
                },

                // Enable hostapd.conf file
                function update_hostapd_conf(next_step) {
                    write_template_to_file(
                        "./assets/etc/hostapd/hostapd.conf.template",
                        "/etc/hostapd/hostapd.conf",
                        context, next_step);
                },

                function update_hostapd_default(next_step) {
                    write_template_to_file(
                        "./assets/etc/default/hostapd.template",
                        "/etc/default/hostapd",
                        context, next_step);
                },

                function update_dnsmasq_conf(next_step) {
                    write_template_to_file(
                        "./assets/etc/dnsmasq/dnsmasq.conf.template",
                        "/etc/dnsmasq.conf",
                        context, next_step);
                },

                function restart_hostapd_service(next_step) {
                    exec("sudo service hostapd restart", function(error, stdout, stderr) {
                        if (!error) console.log("... hostapd restarted!");
                        else console.log("... hostapd failed! - " + stdout);
                        next_step();
                    });
                },

                function reboot_network_interfaces(next_step) {
                    _reboot_wireless_network(config.wifi_interface, next_step);
                },

                function restart_dhcp_service(next_step) {
                    exec("sudo service dnsmasq restart", function(error, stdout, stderr) {
                        if (!error) console.log("... dhcp server restarted!");
                        else console.log("... dhcp server failed! - " + stdout);
                        next_step();
                    });
                },

                function restart_hostapd_service(next_step) {
                    exec("sudo service hostapd stop", function(error, stdout, stderr) {
                        if (!error) console.log("... hostapd restarted!");
                        else console.log("... hostapd failed! - " + stdout);
                        next_step();
                    });
                },

                function restart_hostapd_service(next_step) {
                    exec("sudo service hostapd start", function(error, stdout, stderr) {
                        if (!error) console.log("... hostapd restarted!");
                        else console.log("... hostapd failed! - " + stdout);
                        next_step();
                    });
                }

                
                

            ], callback);
        });
    },

    // Disables AP mode and reverts to wifi connection
    _enable_wifi_mode = function(connection_info, callback) {

        _is_wifi_enabled(function(error, result_ip) {
            if (error) return callback(error);
            
            async.series([

                // Update /etc/network/interface with correct info...
                function update_interfaces(next_step) {
                    write_template_to_file(
                        "./assets/etc/network/interfaces.wifi.template",
                        "/etc/network/interfaces",
                        connection_info, next_step);
                },

                // Stop the DHCP server...
                function restart_dhcp_service(next_step) {
                    exec("sudo service dnsmasq stop", function(error, stdout, stderr) {
                        if (!error) console.log("... dhcp server stopped!");
                        next_step();
                    });
                },

                // Stop the DHCP server...
                function restart_hostapd_service(next_step) {
                    exec("sudo service hostapd stop", function(error, stdout, stderr) {
                        if (!error) console.log("... hostapd stopped!");
                        next_step();
                    });
                },

                function reboot_network_interfaces(next_step) {
                    _reboot_wireless_network(config.wifi_interface, next_step);
                },


            ], callback);
        });

    };

    return {
        get_wifi_info:           _get_wifi_info,
        reboot_wireless_network: _reboot_wireless_network,

        is_wifi_enabled:         _is_wifi_enabled,
        is_wifi_enabled_sync:    _is_wifi_enabled_sync,

        is_ap_enabled:           _is_ap_enabled,
        is_ap_enabled_sync:      _is_ap_enabled_sync,
        is_ethernet_enabled:     _is_ethernet_enabled,

        enable_ap_mode:          _enable_ap_mode,
        enable_wifi_mode:        _enable_wifi_mode,
    };
}



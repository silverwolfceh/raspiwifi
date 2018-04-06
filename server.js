var async               = require("async"),
    wifi_manager        = require("./app/wifi_manager")(),
    dependency_manager  = require("./app/dependency_manager")(),
    exec                = require("child_process").exec,
    stled               = require("./app/statusled")(),
    mdns                = require("./app/mdns")(),
    config              = require("./config.json");


async.series([

    /* Check for dependencies */
    function test_deps(next_step) {
        dependency_manager.check_deps({
            "binaries": ["dnsmasq", "hostapd", "iw"]
        }, function(error) {
            if (error) console.log(" * Dependency error, did you run `sudo npm run-script provision`?");
            next_step(error);
        });
    },

    /* Check if wifi is enabled and start mdns */
    function wifi_check(next_step) {
        wifi_manager.is_wifi_enabled(function(error, result_ip) {
            if (result_ip)
            {
                console.log("\nWifi is enabled, and IP " + result_ip + " assigned");
                var reconfigure = config.access_point.force_reconfigure || false;

                if (reconfigure) /* Reconfigure forcing */
                { 
                    console.log("\nForce reconfigure enabled - try to enable access point");

                    wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {

                        if(error) {
                            console.log("... AP Enable ERROR: " + error);
                            stled.set_state("error");
                        } else {
                            console.log("... AP Enable Success!");
                            stled.set_state("ap");
                        }
                    });

                }
                else /* Not force-reconfigure */
                { 
                    console.log("\nWifi is connected. Starting mdns");

                    mdns.is_mdns_running(function(error, result) {
                        if(error) console.log(error);
                        if(result)
                            console.log("....mDNS is broadcasting...");
                        else
                            mdns.start_mdns(result_ip);
                    });

                }

            }
            else /* Wifi not enable */
            { 
                console.log("\nWifi is not enabled, Enabling AP for self-configure");

                wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {

                    if(error) {
                            console.log("... AP Enable ERROR: " + error);
                            stled.set_state("error");
                    } else {
                        console.log("... AP Enable Success!");
                        stled.set_state("ap");
                    }
                });

            }
            
            next_step(error);

        });
    },

    /* Check if ethernet is enabled and start panl */
    function ethernet_check(next_step) {
        wifi_manager.is_ethernet_enabled(function(error, eth_ip) {
            if(eth_ip) {
                console.log("Ethernet is enabled with IP " + eth_ip);
                console.log("Starting mDNS");
                mdns.is_mdns_running(function(error, result) {
                    if(error) console.log(error);

                    if(result)
                        console.log("....mDNS is broadcasting...");
                    else
                        mdns.start_mdns(eth_ip);
                });
            } else {
                console.log("Ethernet is not connected");
            }
            next_step(error);
        });
    },
    
    /* Kill zwave with is using port 443 */
    function kill_zware_service(next_step) {
        exec("/home/pi/zwarelocal/service/service.sh stop", function(error, stdout, stderr){
            next_step();
        })
    },


    /* Start HTTPs server to handle request */
    function start_http_server(next_step) {
        console.log("HTTPs server running...");
        require("./app/api.js")(wifi_manager, next_step);
    },

], function(error) {
    if (error) {
        console.log("ERROR: " + error);
    }
});

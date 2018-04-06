var path       = require("path"),
    util       = require("util"),
    iwlist     = require("./iwlist"),
    express    = require("express"),
    bodyParser = require('body-parser'),
    config     = require("../config.json"),
    timeout    = require("connect-timeout"),
    fs         = require('fs'),
    https      = require('https'),
    mdns       = require("./mdns")(),
    stled      = require("./statusled")(),
    http_test  = config.http_test_only;

// Helper function to log errors and send a generic status "SUCCESS"
// message to the caller
function log_error_send_success_with(success_obj, error, response) {
    if (error) {
        console.log("ERROR: " + error);
        response.send({ status: "ERROR", error: error });
    } else {
        success_obj = success_obj || {};
        success_obj["status"] = "SUCCESS";
        response.send(success_obj);
    }
    response.end();
}

/*****************************************************************************\
    Returns a function which sets up the app and our various routes.
\*****************************************************************************/
module.exports = function(wifi_manager, callback) {
    /* HTTPS keys */
    var privateKey  = fs.readFileSync(config.server.certificate.key, 'utf8');
    var certificate = fs.readFileSync(config.server.certificate.crt, 'utf8');
    var credentials = {key: privateKey, cert: certificate};



    var app = express();
    // Configure the app
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));
    app.set("trust proxy", true);

    // Setup static routes to public assets
    app.use(express.static(path.join(__dirname, "public")));
    app.use(bodyParser.json());
    app.use(timeout('100s'));

    /* Render the APs list page */
    app.get("/", function(request, response) {
        console.log("Render index")
        response.render("index");
    });


    /* API to get a list of found APs */
    app.get("/api/list-ap", function(request, response) {
        console.log("Request to get list of wifi");
        iwlist(function(error, result) {
            log_error_send_success_with(result[0], error, response);
        });
    });

    app.post("/api/reconfigure", function(request, response) {
        console.log("Reconfigure the new wifi for Hub");
        var success_obj = {};
        success_obj['message'] = "Reconfigure request received";
        log_error_send_success_with(success_obj, 0, response);
        stled.set_state("progress");
        wifi_manager.is_wifi_enabled(function(error, result_ip) {
            if(result_ip) {
                console.log("Current mode is station. Wifi connected.");
                console.log("Switching to AP mode");
                wifi_manager.enable_ap_mode(config.access_point.ssid, function(error1) {
                    if(error1) {
                        console.log("...Error " + error1);
                        stled.set_state("error");
                    } else {
                        console.log("...AP mode enabled");
                        stled.set_state("ap");
                    }
                });
            }
            else
            {
                console.log("...AP mode enabled");
                stled.set_state("ap");
            }
        });
    });

    /* API to joining an AP */
    app.post("/api/join-ap", function(request, response) {

        var conn_info = {
            wifi_ssid:      request.body.wifi_ssid,
            wifi_passcode:  request.body.wifi_passcode,
        };

        console.log("Trying to join " + request.body.wifi_ssid);
        var success_obj = {};
        success_obj['message'] = "Credentials received";
        log_error_send_success_with(success_obj, 0, response);

        stled.set_state("progress");
        wifi_manager.enable_wifi_mode(conn_info, function(error) {

            if (error) {
                console.log("Fail to join AP. Error: " + error);
                stled.set_state("error");
                console.log("Switch back to AP mode");
                stled.set_state("progress");
                wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {
                    console.log("... AP mode restart");
                });
                // response.redirect("/");

            } else {

                console.log("Join AP successful. Check if IP is assigned");
                wifi_manager.is_wifi_enabled(function(error1, result_ip) {

                    if (result_ip) {
                        stled.set_state("station");
                        console.log("IP " + result_ip + " is assigned. Starting PanLHUB if not started");
                        mdns.is_mdns_running(function(error, result) {
                            if(error)
                            {
                                console.log(error);
                            }
                            else
                            {
                                if(result)
                                    mdns.stop_mdns();
                            }
                            mdns.start_mdns(result_ip);
                            stled.set_state("ok");

                        });
                    } else {
                        console.log("No IP is assigned. Switch back to AP mode");
                        stled.set_state("error");
                        wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {
                            console.log("... AP mode reset");
                        });
                    }

                });
            }
        });
    });

    
    /* Start HTTPs server to handle resfult API request */
    var httpsServer = https.createServer(credentials, app);
    httpsServer.listen(443);
}


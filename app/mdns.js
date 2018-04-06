var _       = require("underscore")._,
    async   = require("async"),
    fs      = require("fs"),
    exec    = require("child_process").exec,
    config  = require("../config.json");


module.exports = function() {

    var _start_app = function(ip) {
        console.log("mDNS starting...")
        exec("avahi-publish-service -v RPIMaster _http._tcp 443 txtvers=1 address=" + ip + " port=443", function(error, stdout, stderr) {
            console.log(stdout)
        });
    },
    _stop_app = function() {
        
    },
    _is_running_sync = function(info) {
        if(info > 2)
            return true;
        return false;
    },
    _is_running = function(callback) {
        exec("ps -ef | grep avahi-publish-service | wc -l", function(error, stdout, stderr) {
            if(error) return callback(error, null);
            var lines = stdout.split("\n");
            var info = parseInt(lines[0].trim());

            return callback(null, _is_running_sync(info));
        });
    };
    return {
        start_mdns:             _start_app,
        stop_mdns:              _stop_app,
        is_mdns_running:        _is_running,
    };
}

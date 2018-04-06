var async               = require("async"),
    wifi_manager        = require("./app/wifi_manager")(),
    dependency_manager  = require("./app/dependency_manager")(),
    panl                = require("./app/panl")(),
    stled               = require("./app/statusled")(),
    exec                = require("child_process").exec,
    execFile            = require("child_process").execFile,
    spawn               = require("child_process").spawn,
    config              = require("./config.json");


function start_panl()
{
    // exec("/home/pi/zwarelocal/service/service.sh stop", function(error, stdout, stderr) {

    // });
    // var child = require('child_process').execFile(config.panl.cmd, []); 
    // child.stdout.on('data', function(data) {
    //     console.log(data.toString()); 
    // });
    // child.on('message', function(msg) {
    //     console.log(msg.toString());
    // });
    var p = spawn("./app_iHomeHom", [], {cwd: config.panl.location, detached: true, stdio: "inherit"});
}

function stop_panl()
{
    console.log("Stop panl...");
    panl.stop_panl();
    panl.start_panl();
}

async.series([
    function start_led(next_step) {
        stled.set_state("progress");
        next_step();
    },
    function f1(next_step) {
        console.log("Start panl...");
    	panl.start_panl();
        setTimeout(stop_panl, 60*1000);
        next_step();
    }
], function(error) {
    if (error) {
        console.log("ERROR: " + error);
    }
});

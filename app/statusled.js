var gpio = require('onoff').Gpio;
var ledg = new gpio(23, 'out'),
	ledb = new gpio(24, 'out'),
	ledr = new gpio(18, 'out');

var runningtimer = [];

module.exports = function() {
	var _set_led = function(led, state) {
		led.writeSync(state);
	},
	_clear_all_timer = function() {
		runningtimer.forEach( function(t) {
			clearInterval(t); 
		});
		runningtimer = [];
	},
	_led_on = function(led) {
		_set_led(led, 1);
	},
	_led_off = function(led) {
		_set_led(led, 0);
	},
	_all_led_on = function() {
		_clear_all_timer();
		_set_led(ledr, 1);
		_set_led(ledg, 1);
		_set_led(ledb, 1);
	},
	_all_led_off = function() {
		_clear_all_timer();
		_set_led(ledr, 0);
		_set_led(ledg, 0);
		_set_led(ledb, 0);
	},
	_led_blink = function(led) {
		if(led.readSync() == 1)
			led.writeSync(0);
		else
			led.writeSync(1);
	};

	var _start_blink = function(led) {
		var t1 = setInterval( function() {
			_led_blink(led);
		}, 500);
		runningtimer.push(t1);
	}
	var _set_state = function(state) {
		switch(state)
		{
			case 'ap': // AP mode
			{
				_all_led_off();
				_led_on(ledg);
				break;
			}
			case 'station': // Station mode
			{
				_all_led_off();
				_led_on(ledb);
				break;
			}
			case 'error': // Error occured
			{
				_all_led_off();
				_led_on(ledr);
				break;
			}
			case 'progress': // Something in progress
			{
				_all_led_off();
				_start_blink(ledg);
				break;
			}
			default:
			{
				_all_led_off();
				break;
			}
		}
	};

	return { set_state : _set_state};
}


*** Requirements
- Raspberry pi 3
- First time ethernet or uart connection to config the app
- Internet access (to install dependencies once time)

*** Setup guide
- Check out repository: https://github.com/silverwolfceh/raspiwifi
- Install nodejs version >= v5.12.0 (Refer to appendix below)
- Install bower (Refer to appendix)
- Go to raspiwifi folder and run following command (once-time, need internet connection)
    npm update
    bower install
    sudo npm run-script provision
- Update config.json (optional)

*** Run app
- Go to raspiwifi folder and run: sudo npm start 
This command will reset wlan0 to AP mode and start SSID: VietHacker with passphrase in the config.json file (default: VietHacker/#freedom).
- Connect to the SSID above
- Go to address: https://192.168.44.1
- Select a wifi SSID to connect, then fill in password

*** Make the app run as a service
sudo cp assets/init.d/raspiwifi /etc/init.d/
sudo chmod +x /etc/init.d/raspiwifi
sudo chown root:root /etc/init.d/raspiwifi
sudo update-rc.d raspiwifi defaults
sudo update-rc.d raspiwifi enable


*** Appendix
* Install nodejs
    node -v # Check current version, if it is < v5.12.0 then process follow commands
    sudo su -
    apt-get remove nodered -y
    apt-get remove nodejs nodejs-legacy -y
    apt-get remove npm  -y
    curl -sL https://deb.nodesource.com/setup_5.x | sudo bash -
    apt-get install nodejs -y
    node -v

* Install bower
    npm install -g bower
node-netatmo
============

This is an NPM module to interface with the Netatmo Personal Weather Station API. (http://dev.netatmo.com)

This module would not be possible without the work of Github user [mrose17](https://github.com/mrose17/).

Install
-------

    npm install node-netatmo

API
---

Please consult the [netatmo](http://netatmo.com) private api [documentation](http://dev.netatmo.com/doc/).

### Load module

    var Netatmo = require('node-netatmo')
      , netatmo = new Netatmo.Netatmo()
      ;
    
### Login to cloud

    netatmo.on('error', function(err) {
      ...
    }).setConfig( '$CLIENT_ID' , '$CLIENT_SECRET' , '$USERNAME' , '$PASSWORD').getToken(function(err) {
      if (err) return console.log('getToken: ' + err.message);

      // good to go!
    })

### Get user information

    netatmo.getUser(function(err, results) {
      if (err) return console.log('getUser: ' + err.message);
      if (results.status !== 'ok')  { console.log('getUser not ok'); return console.log(results); }

      // inspect results.body
    }

### Get device information

    netatmo.getDevices(function(err, results) {
      if (err) return console.log('getDevices: ' + err.message);
      if (results.status !== 'ok')  { console.log('getDevices not ok'); return console.log(results); }

      // inspect results.body
    }

#### Get sensor measurements

It would be best if you read the [documentation](http://dev.netatmo.com/doc/) to understand the supported values for params:

    var params = { device_id : '....'  // if not present, uses the first device_id from the previous call to getDevices
                 , module_id : null    // optional
                 , scale     : '1day'  // or: max, 30min, 3hours, 1week, 1month

                                       // at least one of these must be present
                 , type      : [ 'Temperature', 'CO2', 'Humidity', 'Pressure', 'Noise' ]

                                       // these are all optional
                 , date_begin : utc-timestamp
                 , date_end   : utc-timestamp
                 , limit      : 1024
                 , optimize   : false
                 };

    netatmo.getMeasurement(params, function(err, results) {
      if (err) return console.log('getMeasurement: ' + err.message);
      if (results.status !== 'ok')  { console.log('getMeasurement not ok'); return console.log(results); }

      // inspect results.body
    }

Finally
-------

Enjoy!

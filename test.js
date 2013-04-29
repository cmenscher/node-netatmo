var Netatmo = require('./netatmo')
  , netatmo = new Netatmo.Netatmo();

var zero = 0;

netatmo.on('error', function(err) {
  console.log('netatmo error'); console.error (err);
}).setConfig( '$CLIENT_ID'
            , '$CLIENT_SECRET'
            , '$USERNAME'
            , '$PASSWORD'
).getToken(function(err) {
  if (err) return console.log('getToken: ' + err.message);

  netatmo.getUser(function(err, results) {
    var user;

    if (err) return console.log('getUser: ' + err.message);
    if (results.status !== 'ok')  { console.log('getUser not ok'); return console.log(results); }
    user = results.body;

    netatmo.getDevices(function(err, results) {
      var deviceID, devices, i, j, modules;

      if (err) return console.log('getDevices: ' + err.message);
      if (results.status !== 'ok')  { console.log('getDevices not ok'); return console.log(results); }
      devices = {};
      modules = {};
      for (i = 0; i < results.body.devices.length; i++) devices[results.body.devices[i]._id] = results.body.devices[i];
      for (i = 0; i < results.body.modules.length; i++) modules[results.body.modules[i]._id] = results.body.modules[i];

      for (i = 0; i < user.devices.length; i++) {
        deviceID = user.devices[i];
        getInfo(netatmo, 0, deviceID);
        for (j = 0; j < devices[deviceID].modules.length; j++) getInfo(netatmo, 0, deviceID, devices[deviceID].modules[j]);
      }
      for (i = 0; i < user.friend_devices.length; i++) {
        deviceID = user.friend_devices[i];
        getInfo(netatmo, 1, deviceID);
        for (j = 0; j < devices[deviceID].modules.length; j++) getInfo(netatmo, 1, deviceID, devices[deviceID].modules[j]);
      }
    });
  });
});

var getInfo = function(self, friendP, deviceID, moduleID) {
  var params = { device_id : deviceID
               , module_id : moduleID
               , scale     : 'max'
               , date_end  : 'last'
               };

  zero++;
  self.getMeasurement(params, function(err, results) {
    if (err) console.log('getMeasurements: ' + err.message);
    else if (results.status !== 'ok')  { console.log('getMeasurements not ok'); return console.log(results); }
    else {
      console.log('deviceID: ' + deviceID + ' moduleID: ' + (moduleID || '[]') + ' friendP=' + friendP);
      console.log(JSON.stringify(results.body));
    }

    if (--zero === 0) console.log('finished.');
  });
};

/*
 Copyright 2013 Corey Menscher

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions
 of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 DEALINGS IN THE SOFTWARE.

 FYI: Netatmo is a registered trademark of Netatmo (SAS)

 */

//HTTP
var https = require('https');
var querystring = require('querystring');

var events = require('events');
var util = require('util');

var DEFAULT_CONFIG = {
    auth_request: {
        grant_type: "password",
        client_id: '$CLIENT_ID',
        client_secret: '$CLIENT_SECRET',
        username: '$USERNAME',
        password: '$PASSWORD'
    },

    auth_refresh: {
        grant_type: "refresh_token",
        refresh_token: "",
        client_id: '$CLIENT_ID',
        client_secret: '$CLIENT_SECRET'
    },

    auth_options: {
        hostname: "api.netatmo.net",
        headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Content-Length": 0},
        port: 443,
        path: "/oauth2/token",
        method: "POST"
    },

    credentials: {
        "access_token": "",
        "expires_in": 0,
        "expire_in": 0,
        "scope": null,
        "refresh_token": ""
    },

    api_options: {
        hostname: "api.netatmo.net",
        headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"}
    },

    tokenCheckInterval: 60 * 1000
};

var DEFAULT_LOGGER = { error   : function(msg, props) { console.log(msg); console.trace(props.exception); }
                     , warning : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     , notice  : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     , info    : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     , debug   : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     };

var Netatmo = function(info) {
    this.devices = null;
    this.currentValue = 0; // holds the last value of whatever we decide to examine (i.e. Temp, Pressure, Humidity, Sound...)
    this.lastValue = 0; // holds the last value of whatever we decide to examine (i.e. Temp, Pressure, Humidity, Sound...)
    this.config = DEFAULT_CONFIG;
    this.logger = DEFAULT_LOGGER;

    if (!!info) this.initialize(info);
};
util.inherits(Netatmo, events.EventEmitter);

Netatmo.prototype.setConfig = function(clientID, clientSecret, username, password) {
  this.initialize({ $CLIENT_ID     : clientID
                  , $CLIENT_SECRET : clientSecret
                  , $USERNAME      : username
                  , $PASSWORD      : password
                  });
  return this;
};

Netatmo.prototype.initialize = function(info) {
  var op, param, value;

  for (op in this.config) {
    if (!this.config.hasOwnProperty(op)) continue;

    for (param in this.config[op]) {
      if (!this.config[op].hasOwnProperty(param)) continue;

      value = this.config[op][param];
      if (!!info[value]) this.config[op][param] = info[value];
    }
  }
};

Netatmo.prototype.getToken = function(callback) {
    var _this = this;

    _this.logger.info("Getting authorization token...");

    if(arguments.length === 0) {
        callback = function(err) { _this.logger.error('getToken error', { excepton: err }); };
    }

    var auth_data = querystring.stringify(_this.config.auth_request);

    //SET THE HEADERS!!!
    _this.config.auth_options.headers = {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Content-Length": auth_data.length};

    _this.tokenUpdated = new Date().getTime();
    https.request(_this.config.auth_options, function(res) {
      var content = '';

      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        content += chunk.toString();
      }).on('end', function() {
        var cred_obj;

        try {
          cred_obj = JSON.parse(content);
          if ((!cred_obj.access_token) || (!cred_obj.refresh_token)) {
            return callback(new Error('getToken failed'));
          }
        } catch(ex) { return callback(ex); }

        _this.config.credentials.access_token = cred_obj.access_token;
        _this.config.credentials.expires_in = cred_obj.expires_in;
        if (_this.config.credentials.expires_in < 120) _this.config.credentials.expires_in = 180;
        _this.config.credentials.expire_in = cred_obj.expire_in;
        _this.config.credentials.scope = cred_obj.scope;
        _this.config.credentials.refresh_token = cred_obj.refresh_token;
        _this.config.tokenCheckInterval = (_this.config.credentials.expires_in - 120) * 1000;
        _this.logger.info("Successfully retrieved token, next check in " + (_this.config.tokenCheckInterval/1000) + ' secs');

        setTimeout(function () { _this.refreshToken(_this); }, _this.config.tokenCheckInterval);
        callback(null);
      });
    }).on('error', function(err) {
      callback(err);
    }).end(auth_data);

    return _this;
};

Netatmo.prototype.refreshToken = function(_this) {
    _this.logger.info("Refreshing authorization token...");

    // Set the refresh token based on current credentials
    _this.config.auth_refresh.refresh_token = _this.config.credentials.refresh_token;

    var auth_data = querystring.stringify(_this.config.auth_refresh);

    //SET THE HEADERS!!!
    _this.config.auth_options.headers = {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Content-Length": auth_data.length};

    _this.tokenUpdated = new Date().getTime();
    https.request(_this.config.auth_options, function(res) {
      var content = '';

      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        content += chunk.toString();
      }).on('end', function() {
        var cred_obj;

        try {
          cred_obj = JSON.parse(content);
          if ((!cred_obj.access_token) || (!cred_obj.refresh_token)) {
            return _this.emit('error', new Error('refreshToken failed'));
          }
        } catch(ex) { return _this.emit('error', ex); }

        _this.config.credentials.access_token = cred_obj.access_token;
        _this.config.credentials.expires_in = cred_obj.expires_in;
        if (_this.config.credentials.expires_in < 120) _this.config.credentials.expires_in = 180;
        _this.config.credentials.expire_in = cred_obj.expire_in;
        _this.config.credentials.scope = cred_obj.scope;
        _this.config.credentials.refresh_token = cred_obj.refresh_token;
        _this.config.tokenCheckInterval = (_this.config.credentials.expires_in - 120) * 1000;
        _this.logger.info("Successfully refreshed access token, next check in " + (_this.config.tokenCheckInterval/1000) + ' secs');

        setTimeout(function () { _this.refreshToken(_this); }, _this.config.tokenCheckInterval);
      });
    }).on('error', function(err) {
      _this.emit('error', err);
    }).end(auth_data);
};

Netatmo.prototype.invoke = function(path, callback) {
  var _this = this;

  if (!callback) {
    callback = function(err, msg) {
      if (err) _this.logger.error('netatmo error', { exception: err }); else _this.logger.info(msg);
    };
  }

  _this.config.api_options.path = path;

  https.request(_this.config.api_options, function(response) {
    var content = '';

    response.setEncoding('utf8');
    response.on('data', function(chunk) {
      content += chunk.toString();
    }).on('end', function() {
      var results;

      try {
        results = JSON.parse(content);
        if ((!_this.devices) && (!!results.body) && (util.isArray(results.body.devices))) _this.devices = results.body.devices;

if(results.status!== 'ok'){
console.log((new Date().getTime()) / 1000);
console.log(JSON.stringify(_this.tokenUpdated));
console.log(JSON.stringify(_this.config.nextTokenRefresh));
console.log(JSON.stringify(_this.config.tokenCheckInterval));
console.log(JSON.stringify(_this.config.credentials));
}
        callback(null, results);
      } catch(ex) { callback(ex); }
    });
  }).on('error', function(err) {
    callback(err);
console.log((new Date().getTime()) / 1000);
console.log(JSON.stringify(_this.tokenUpdated));
console.log(JSON.stringify(_this.config.nextTokenRefresh));
console.log(JSON.stringify(_this.config.tokenCheckInterval));
console.log(JSON.stringify(_this.config.credentials));
  }).end();
};

Netatmo.prototype.getUser = function(callback) {
  this.invoke("/api/getuser?access_token="    + this.config.credentials.access_token, callback);
};

Netatmo.prototype.getDevices = function(callback) {
  this.invoke("/api/devicelist?access_token=" + this.config.credentials.access_token, callback);
};

Netatmo.prototype.getMeasurement = function(params, callback) {
  var path = "/api/devicelist?access_token="  + this.config.credentials.access_token;

  params = params || {};
  if (typeof params === 'function') {
    callback = params;
    params = {};
  }
  if (!params.device_id) params.device_id = this.devices[0]._id;
// module_id: optional
  if (!params.scale) params.scale = '1day';
  if (!params.type) params.type = [ 'Temperature', 'CO2', 'Humidity', 'Pressure', 'Noise' ];
  if (util.isArray(params.type)) params.type = params.type.join(',');

  if (!params.device_id) return callback(new Error('getDevices must be called first'));

  path = "/api/getmeasure?access_token=" + this.config.credentials.access_token + '&' + querystring.stringify(params);

  this.invoke(path, callback);
};

exports.Netatmo = Netatmo;

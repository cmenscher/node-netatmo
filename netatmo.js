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

    nextTokenRefresh: 0,
    tokenCheckInterval: 60 * 1000
};

var DEFAULT_LOGGER = { error   : function(msg, props) { console.log(msg); console.trace(props.exception); }
                     , warning : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     , notice  : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     , info    : function(msg, props) { console.log(msg); if (props) console.log(props);  }
                     };

var Netatmo = function(info) {
    this.devices = null;
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
        callback = function(err) { _this.logger.error(err); };
    }

    var auth_data = querystring.stringify(_this.config.auth_request);

    //SET THE HEADERS!!!
    _this.config.auth_options.headers = {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Content-Length": auth_data.length};

    _this.tokenUpdated = new Date().getTime() / 1000;
    https.request(_this.config.auth_options, function(res) {
      res.on('data', function(d) {
        var cred_obj = JSON.parse(d);
        _this.config.credentials.access_token = cred_obj.access_token;
        _this.config.credentials.expires_in = cred_obj.expires_in;
        _this.config.credentials.expire_in = cred_obj.expire_in;
        _this.config.credentials.scope = cred_obj.scope;
        _this.config.credentials.refresh_token = cred_obj.refresh_token;
        _this.config.nextTokenRefresh = _this.tokenUpdated + _this.config.credentials.expires_in;

        _this.logger.info("Successfully retrieved token...");

        _this.refreshTokenTimer = setInterval(function () { _this.refreshTokenCheck(_this); }, _this.config.tokenCheckInterval);
        callback(null);
      });
    }).on('error', function(err) {
      callback(err);
    }).end(auth_data);

    return _this;
};

Netatmo.prototype.refreshTokenCheck = function(_this) {
    _this.logger.info("Checking to see if the access token needs to be refreshed...");

    var now = new Date();

    // Note: adding 2 minutes to the expires_in cutoff so we can prevent loop() from being called when the token has expired
    // There's probably a better way to do this.
    if(_this.config.nextTokenRefresh <= (_this.tokenUpdated + _this.config.credentials.expires_in + 120000)) return;

    _this.tokenUpdated = now; // update tokenUpdated to now so we can check all over again
    _this.refreshToken();

    _this.logger.info("Refreshing authorization token...");

    // Set the refresh token based on current credentials
    _this.config.auth_refresh.refresh_token = _this.config.credentials.refresh_token;

    var auth_data = querystring.stringify(_this.config.auth_refresh);

    //SET THE HEADERS!!!
    _this.config.auth_options.headers = {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Content-Length": auth_data.length};

    var req = https.request(_this.config.auth_options, function(res) {
        res.on('data', function(d) {
            var cred_obj = JSON.parse(d);
            _this.config.credentials.access_token = cred_obj.access_token;
            _this.config.credentials.expires_in = cred_obj.expires_in * 1000; // convert to millis
            _this.config.credentials.expire_in = cred_obj.expire_in * 1000; // convert to millis
            _this.config.credentials.scope = cred_obj.scope;
            _this.config.credentials.refresh_token = cred_obj.refresh_token;

            _this.config.nextTokenRefresh = _this.tokenUpdated + _this.config.credentials.expires_in;

            _this.logger.info("Successfully refreshed access token...");
        });
    });

    req.write(auth_data);
    req.end();

    req.on('error', function(err) {
      _this.emit('error', err);
    });
};

Netatmo.prototype.invoke = function(path, callback) {
  var _this = this;

  if (!callback) callback = function(err, msg) { if (err) _this.logger.error(err); else _this.logger.info(msg); };

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

        callback(null, results);
      } catch(ex) { callback(ex); }
    });
  }).on('error', function(err) {
    callback(err);
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

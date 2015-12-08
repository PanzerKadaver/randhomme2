#!/bin/env node

var _express	= require('express');
var _fs			= require('fs');
var _mongoose	= require('mongoose');
var _bodyParser	= require('body-parser');
var _multipart	= require('connect-multiparty');
var _gm = require('gm').subClass({imageMagick: true});
var _path = require('path');

/**
 *  Define the application.
 */
var RandApp = function() {

	//  Scope.
	var self = this;
	self.express = _express;
	self.fs = _fs;
	self.mongoose = _mongoose;
	self.bodyParser = _bodyParser;
	self.multipart = _multipart;
	self.multipartMiddleware = self.multipart();
	self.gm = _gm;
	self.path = _path;

	var FlowUploader = require('./server/flow-uploader.js')
	self.uploader = new FlowUploader();
	self.uploadPath = self.path.resolve(self.uploader.uploadDir);
	self.tempPath = self.path.resolve(self.uploader.tempDir);

	

	/*  ================================================================  */
	/*  Helper functions.                                                 */
	/*  ================================================================  */

	/**
	 *  Set up server IP address and port # using env variables/defaults.
	 */
	self.setupVariables = function() {
		require('./server/init/setupVariables')(self);
	};


	/**
	 *  Populate the cache.
	 */
	self.populateCache = function() {
		if (typeof self.zcache === "undefined") {
			self.zcache = { 'index.html': '' };
		}

		//  Local cache for static content.
		self.zcache['index.html'] = self.fs.readFileSync('./index.html');
	};

	/**
	 * DEV FUNCTION
	 */
	self.rCache = function() {
		self.populateCache();
	};


	/**
	 *  Retrieve entry (content) from cache.
	 *  @param {string} key  Key identifying content to retrieve from cache.
	 */
	self.cache_get = function(key) { return self.zcache[key]; };

	/**
	 *  terminator === the termination handler
	 *  Terminate server on receipt of the specified signal.
	 *  @param {string} sig  Signal to terminate on.
	 */
	self.terminator = function(sig){
		if (typeof sig === "string") {
		   console.log('%s: Received %s - terminating app ...',
					   Date(Date.now()), sig);
		   process.exit(1);
		}
		console.log('%s: Node server stopped.', Date(Date.now()) );
	};


	/**
	 *  Setup termination handlers (for exit and a list of signals).
	 */
	self.setupTerminationHandlers = function(){
		//  Process on exit and signals.
		process.on('exit', function() { self.terminator(); });

		// Removed 'SIGPIPE' from the list - bugz 852598.
		['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
		 'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
		].forEach(function(element, index, array) {
			process.on(element, function() { self.terminator(element); });
		});
	};


	/*  ================================================================  */
	/*  App server functions (main app logic here).                       */
	/*  ================================================================  */

	/**
	 *  Define statics folders
	 */
	self.setupStatic = function() {
		require('./server/init/setupStatic')(self);
	};

	self.setupMongo = function () {
		var options = {
			db: { native_parser: true },
			replset: {},
			server: { poolSize: 5 }
		};

	 	options.server.socketOptions = options.replset.socketOptions = { keepAlive: 1 };
	 	self.mongoose.connect(self.mongo.url, function (err) {
	 		if (err)
	 			throw err;
	 		else
	 			console.warn('Successfully connected to DB');
	 	});

	 	self.hommeSchema = new self.mongoose.Schema({
			code : { type : String, match: /^[0-9]+$/ },
			//mail : { type : String, match: /^(([a-zA-Z]|[0-9])|([-]|[_]|[.]))+[@](([a-zA-Z0-9])|([-])){2,63}[.](([a-zA-Z0-9]){2,63})+$/ },
			date : { type : Date, default : Date.now }
		});

		self.hommeModel = self.mongoose.model('homme', self.hommeSchema);
	};

	/**
	 *  Create the routing table entries + handlers for the application.
	 */
	self.createRoutes = function() {
		require('./server/routes')(self);
	};


	/**
	 *  Initialize the server (express) and create the routes and register
	 *  the handlers.
	 */
	self.initializeServer = function() {
		self.app = self.express();

		self.app.use(self.bodyParser.urlencoded({ extended: true }));

		// Add statics folders
		self.setupStatic();

		// Engage connection to db
		self.setupMongo();

		// Create routes
		self.createRoutes();

		//  Add handlers for the app (from the routes).
		for (var r in self.routes) {
			self.app.get(r, self.routes[r]);
		}
		for (var r in self.post) {
			self.app.post(r, self.post[r]);
		}
	};


	/**
	 *  Initializes the sample application.
	 */
	self.initialize = function() {
		self.setupVariables();
		self.populateCache();
		self.setupTerminationHandlers();

		// Create the express server and routes.
		self.initializeServer();
	};


	/**
	 *  Start the server (starts up the sample application).
	 */
	self.start = function() {
		//  Start the app on the specific interface (and port).
		self.app.listen(self.port, self.ipaddress, function() {
			console.log('%s: Node server started on %s:%d ...',
						Date(Date.now() ), self.ipaddress, self.port);
		});
	};

	self.newHomme = function(req, res) {
		var number = Math.floor((99999999-0)*Math.random())+0;
		console.log(number);
		var sNumber = number.toString();
		var query = self.hommeModel.find(null);

		query.where('code', sNumber);

		query.exec(function (err, docs) {
			if (err) { throw err; }

			if (docs.length != 0)
				return self.newHomme();
			else {
				var nh = self.hommeModel({ code: sNumber});
				return self.uploader
					.saveChunk(req, sNumber)
					.then(
						status => 	(res.status(200).send(status),
									nh.save(function (err) {
										if (err) throw err;
										console.log("homme saved");
										self.gm(self.uploadPath+"/"+sNumber+".jpg")
										.resize(680, 916, '!')
										.write(self.uploadPath+"/"+sNumber+".jpg", function (err) {
											if (!err) console.log('resize done');
											else throw err;
										});
									})),
						err => res.status(400).send(err) //console.log(err)
				);
			}
		});
	};

};   /*  RanHomme Application.  */



/**
 *  main():  Main code.
 */
var zapp = new RandApp();
zapp.initialize();
zapp.start();


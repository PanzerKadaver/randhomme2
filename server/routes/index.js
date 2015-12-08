module.exports = function (self) {
	self.routes = { };
	self.post = { };
		
	self.routes['/'] = function (req, res) {
		res.setHeader('Content-Type', 'text/html');
		self.rCache();
		res.send(self.cache_get('index.html') );
	};

	// Handle status checks on chunks through Flow.js
	self.app.get('/upload', function (req, res){
		return self.uploader
			.chunkExists(req)
			.then(
				() => res.status(200).send(),
				() => res.status(204).send()
		);
	});

	self.app.get('/melt', function (req, res) {
		
	});

	// Handle uploads through Flow.js
	self.app.post('/upload', self.multipartMiddleware, function(req, res) {
		return self.newHomme(req, res);
		/*return self.uploader
			.saveChunk(req)
			.then(
				status => res.status(200).send(status), //console.log(status), 
				err => res.status(400).send(err) //console.log(err)
			);*/
	});
}
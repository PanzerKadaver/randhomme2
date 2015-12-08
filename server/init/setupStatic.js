/**
 *  Define statics folders
 */

module.exports = function (self) {
	self.app.use('/lib', self.express.static('app/libraries'));
	self.app.use('/js', self.express.static('app/scripts'));
	self.app.use('/ctrl', self.express.static('app/controllers'));
	self.app.use('/svc', self.express.static('app/services'));
	self.app.use('/css', self.express.static('app/styles'));
	self.app.use('/img', self.express.static('app/images'));
	self.app.use('/aud', self.express.static('app/audio'));
	self.app.use('/view', self.express.static('app/views'));
};
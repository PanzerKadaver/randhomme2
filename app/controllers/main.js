RandControllers.controller('MainCtrl', ['$rootScope', '$scope', '$http', '$timeout', 'Cropper', function ($rootScope, $scope, $http, $timeout, Cropper) {
	var file, data;
	console.log(Cropper);

	$scope.safeApply = function(fn) {
	  var phase = this.$root.$$phase;
	  if(phase == '$apply' || phase == '$digest') {
	    if(fn && (typeof(fn) === 'function')) {
	      fn();
	    }
	  } else {
	    this.$apply(fn);
	  }
	};

	$scope.flow = {}

	$scope.$on('flow::fileAdded', function (event, $flow, flowFile) {
		console.log("fileAdded");
	});

	$scope.$on('flow::filesAdded', function (event, $flow, flowFile) {
		console.log("filesAdded");
	});

	$scope.$on('flow::filesSubmitted', function (event, $flow, flowFile) {
		console.log("filesSubmitted");

		/*while ($scope.flow.files.length > 1) {
			$scope.flow.files = $scope.flow.files.splice(1, 1);
		}*/
		console.log($scope.flow.files);

		if (!file || !data) return;
		Cropper.crop(file, data).then(Cropper.encode).then(function(dataUrl) {
			($scope.preview || ($scope.preview = {})).dataUrl = dataUrl;
		});
	});

	$scope.onFile = function(blob) {
		console.log(blob);
		Cropper.encode((file = blob)).then(function(dataUrl) {
			$scope.dataUrl = dataUrl;
			$timeout(showCropper);  // wait for $digest to set image's src
		});
	};

	$scope.cropUpload = function () {
		if (!file || !data) return;
		console.log(file);
		console.log($scope.flow.files[0]);
		Cropper.crop(file, data).then(Cropper.encode).then(function(dataUrl) {

			var BASE64_MARKER = ';base64,';
	    	if (dataUrl.indexOf(BASE64_MARKER) == -1) {
		        var parts = dataUrl.split(',');
		        var contentType = parts[0].split(':')[1];
		        var raw = decodeURIComponent(parts[1]);
		        return new Blob([raw], {type: contentType});
	    	}
		    var parts = dataUrl.split(BASE64_MARKER);
		    var contentType = parts[0].split(':')[1];
		    var raw = window.atob(parts[1]);
		    var rawLength = raw.length;
		    var uInt8Array = new Uint8Array(rawLength);
		    for (var i = 0; i < rawLength; ++i) {
		        uInt8Array[i] = raw.charCodeAt(i);
		    }
		    var blob = new Blob([uInt8Array], {type: contentType});
		    blob.lastModified = file.lastModified;
		    blob.lastModifiedDate = file.lastModifiedDate;
		   	blob.name = file.name;


		    $scope.flow.addFile(blob);
		    //console.log($scope.flow.files[0]);
		    $scope.flow.upload();
		});

		/*var blob = Cropper.crop(file, data).value
		$scope.flow.addFile(new File([blob], "blob"));*/
	    /*Cropper.crop(file, data).then(Cropper.encode).then(function(dataUrl) {
	      ($scope.preview || ($scope.preview = {})).dataUrl = dataUrl;
	    });*/
		//$scope.flow.upload();
	}

	$scope.cropper = {};
	$scope.cropperProxy = 'cropper.first';

	$scope.options = {
		aspectRatio: 170 / 229,
		autoCropArea: 1,
		strict: false,
		guides: false,
		highlight: false,
		dragCrop: false,
		cropBoxMovable: false,
		cropBoxResizable: false,
		crop: function(dataNew) {
			data = dataNew;
		}
	};

	$scope.showEvent = 'show';
	$scope.hideEvent = 'hide';

	function showCropper() { $scope.$broadcast($scope.showEvent); }
	function hideCropper() { $scope.$broadcast($scope.hideEvent); }
}]);
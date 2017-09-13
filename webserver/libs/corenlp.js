var request = require('request')
	, _ = require('lodash')
	, async = require('async')
	;
	
module.exports = function(){
	var options = _.defaults(arguments[0], {
		host: 'localhost',
		port: '9000'
	});
	
	var defaultProperties = {};
	if(typeof arguments[1] != 'undefined' && arguments[1] != null)
		defaultProperties = _.defaults(arguments[1], defaultProperties);
	
	function tag(data){
		var properties = {};
		
		if(arguments.length == 3)
			properties = arguments[1];
		
		properties = _.defaults(properties, defaultProperties);
		
		var callback = arguments[arguments.length - 1];
		
		request({
			uri: 'http://' + options.host + ':' + options.port + '/?properties=' + encodeURIComponent(JSON.stringify(properties)),
			method: 'POST',
			body: data,
			contentType: 'text/plain'
		}, function (error, response, body) {
			
			body = body.replace(/\\n/g, "\\n")  
               .replace(/\\'/g, "\\'")
               .replace(/\\"/g, '\\"')
               .replace(/\\&/g, "\\&")
               .replace(/\\r/g, "\\r")
               .replace(/\\t/g, "\\t")
               .replace(/\\b/g, "\\b")
               .replace(/\\f/g, "\\f")
			   .replace(/[\u0000-\u0019]+/g,"")
			   ;
			
			if (!error && response.statusCode == 200) {
				setImmediate(function(){
					callback(null, JSON.parse(body));
				});
			}else{
				callback(error);
			}
		});
	}
		
	this.tag = tag;
	
	function pos(data){
		var properties = {
			"annotators": "pos"
		};
		
		if(arguments.length == 3)
			properties = arguments[1];
		
		properties = _.defaults(properties, defaultProperties);
		
		var callback = arguments[arguments.length - 1];
		
		tag(data, properties, callback);
	}
	
	this.pos = pos;
};
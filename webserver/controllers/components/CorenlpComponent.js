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
	
	function parse(data){
		var properties = {};
		
		if(arguments.length == 3)
			properties = arguments[1];
		
		properties = _.defaults(properties, defaultProperties);
		
		var callback = arguments[arguments.length - 1];
		
		var paragraphs = data.split(/(\n\s*\n)+/g);
		
		async.mapLimit(paragraphs, 5, (paragraph, nextParagraph) => {
			//Skip paragraphs which look too strange
			var ratio = 1 / paragraph.length * (paragraph.length - paragraph.replace(/[A-Za-z\-\,\.\?\s]/g,'').length);
			var avgWordLength = paragraph.length / paragraph.split(/\s+/g).length;
			//console.log('Parsing: ' + paragraph + "\n********\nRatio: " + ratio + "\n" + avgWordLength + "\n*******");
			
			if(ratio < 0.9 || avgWordLength > 10){
				console.log('Skipping paragraph (Ratio: ' + ratio + ', avg. word length: ' + avgWordLength + ': ' + paragraph.replace(/\s+/g,' '));
				return setImmediate(() => nextParagraph(null, null));
			}
				
			request({
				uri: 'http://' + options.host + ':' + options.port + '/?properties=' + encodeURIComponent(JSON.stringify(properties)),
				method: 'POST',
				body: paragraph,
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
						var json = null;
						try {
							json = JSON.parse(body);
						}catch(e){
							json = null;
						}
						nextParagraph(null, json);
					});
				}else if(error){
					nextParagraph(null, error);
				}else{
					nextParagraph(null, new Error('Statuscode: ' + response.statusCode + "\n" + body));
				}
			});
		}, (err, parsed) => {
			if(err)
				return setImmediate(() => callback(err));

			var sentences = [];
			
			parsed.forEach((p) => {
				if(_.isError(p))return;
				if(_.isNull(p))return;
				if(_.isEmpty(p.sentences))return;
				
				p.sentences.forEach((s) => {
					sentences.push(s);
				});
			});
			//return setImmediate(() => callback(new Error('break')));
			setImmediate(() => callback(null, {sentences: sentences}));
		});
	}
		
	this.parse = parse;
};
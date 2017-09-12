var _ = require('lodash')
	, async = require('async')
	, request = require('request')
	;

module.exports = function(){
	var options = {
		host: '127.0.0.1',
		port: '8080'
	};
	
	if(arguments[0])
		options = _.defaults(arguments[0], options);
	
	function parse(sentences, callback){
		/*
			Build GermaNer input format:				
			sentence1_token1
			sentence1_token2
			sentence1_token3
			.
			sentence2_token1
			sentence2_token2
			...
		*/
		var data = [];
	
		_.each(sentences, function(tokens){
			var sentence = tokens.join("\n");
	
			if(sentence.replace(/\s+/g,'').length > 0){
				sentence = sentence.replace(/\n+/g, '\n');
				data.push(sentence);
			}
		});
		
		data = data.join("\n\n") + "\n.\n";
		//console.log(data);
		request({
			uri: 'http://' + options.host + ':' + options.port + '/germaner', //ToDo: read from config
			method: 'POST',
			body: data,
			contentType: 'text/plain'
		}, (err, response) => {
			//console.log('http://' + options.host + ':' + options.port + '/germaner', err, response, body);
			if(err)return setImmediate(() => callback(err));
			if(response.statusCode != 200)return setImmediate(() => callback(new Error('Invalid status code ' + response.statusCode + ' of GermaNer (expected: 200)')));
			
			/*
			The server responses with one entity per line prefixed by the entity type:
				TYPE entity1
				TYPE entity2
				TYPE entity3
			*/	
						
			var entities = [];				
			response.body.split('\n').forEach(entity => {
				entity = entity.replace(/^\s+/g,'').replace(/\s+$/g,''); //Remove surrounding spaces
				
				if(entity.length > 0){									
					var tokens = entity.split(/\s+/g)
						, type = tokens.shift()
						, value = tokens.join(' ')
						;
					
					entities.push({
						type: type,
						value: value
					});
				}
			});
			
			setImmediate(() => callback(null, entities));
		});
	}
	
	this.parse = parse;
}
var request = require('request')
	, _ = require('lodash')
	, async = require('async')
	;
var fs = require('fs')


function sanitizeBeforeAfter(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(sanitizeBeforeAfter);
  } else if (obj !== null && typeof obj === 'object') {
    for (const key in obj) {
      if (key === 'before' || key === 'after') {
        obj[key] = '';
      } else {
        sanitizeBeforeAfter(obj[key]);
      }
    }
  }
  return obj;
}
	
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
				//console.log('Skipping paragraph (Ratio: ' + ratio + ', avg. word length: ' + avgWordLength + ': ' + paragraph.replace(/\s+/g,' '));
				return setImmediate(() => nextParagraph(null, null));
			}
			var ref = /*'http://localhost:9000'*/ process.env.CORENLP_HOST 
			request({
				uri: `${ref}/relation`,
				method: 'POST',
				body: JSON.stringify({ text: paragraph}),
				headers: {
					'Content-Type': 'application/json'
				}
			}, function (error, response, body) {
				if(error)
				{
					console.log(error);
				}
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
							if(json.sentences.length !== 0)
							{
								var test = sanitizeBeforeAfter(json);
								json = test;
								
							}
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
		}, (err, results) => {
			if(err)
				return setImmediate(() => callback(err));
			//all indices in sentences and results are starting at zero, need to update them with global indices
			var finalSentences = [];
			var finalEntities = {};
			var finalRelations = {};
			var global_idx = 0;

			results.forEach((paragraph) => {
				if(_.isError(paragraph))return;
				if(_.isNull(paragraph))return;
				if(_.isEmpty(paragraph.sentences))return;
				
				paragraph.sentences.forEach((s) => {
					s.index += global_idx;
					finalSentences.push(s);
				});

				for(let ent in paragraph.entities)
				{
					let local_ent = paragraph.entities[ent]
					local_ent.sent_idx = local_ent.sent_idx.map((pos) => pos += global_idx);
					if(!finalEntities[ent])
					{
						finalEntities[ent] = local_ent;
					} else 
					{
						finalEntities[ent].sent_idx.push(...local_ent.sent_idx);
					}
				}

				for(let ent1 in paragraph.relations)
				{
					if(!finalRelations[ent1])
					{
						finalRelations[ent1] = {};
					}
					for(let ent2 in paragraph.relations[ent1])
					{
						let adjustedPositions = paragraph.relations[ent1][ent2].positions.map((pos) => pos += global_idx);
						if(!finalRelations[ent1][ent2])
						{
							finalRelations[ent1][ent2] = {
								positions: [],
								relations: []
							};
						}
						finalRelations[ent1][ent2].positions.push(...adjustedPositions);
						finalRelations[ent1][ent2].relations.push(...paragraph.relations[ent1][ent2].relations)
					}
				}

				global_idx += paragraph.sentences.length
			});
			//return setImmediate(() => callback(new Error('break')));
			var data = {
				sentences: finalSentences,
				entities:  finalEntities,
				relations: finalRelations
			}
			dump_to_disk(data)
			setImmediate(() => callback(null, data));
		});
	}
		
	this.parse = parse;

	function dump_to_disk(data)
	{
		fs.writeFileSync('server_output.json', JSON.stringify(data, null, 4));
	}
};
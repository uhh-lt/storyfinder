var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, path = require('path')
	;

module.exports = function(Ngram, Article){
	var t = {
		0: 3,
		1: 3,
		2: 3
	};

	function getKeywords(candidates, nsize, collectionId, callback){
		Article.countDocumentsInCollection(collectionId, (err, d) => {
			if(err)return setImmediate(() => callback(err));
			d++; //Add +1 for the current document

			if(d < 4){
				console.log('Keyword extraction expects at least 3 documents in the corpus');
				return setImmediate(() => callback(null, []));
			}
			
			var weights = [];
						
			Ngram.docsByValue(_.keys(candidates), collectionId, (err, docs) => {
				if(err)return setImmediate(() => callback(err));
				
				//Get the maximum term frequency for normalization
				var tfMax = _.reduce(candidates, (n, o) => {
					return Math.max(n, o.length);
				}, 1);
				
				//Calculate weights
				_.forOwn(candidates, (o, candidate) => {
					var n = 0;
					if(docs[candidate])
						n = docs[candidate].docs;
					n++;
					
					var tf = o.length / tfMax
						;
					
					/*
						d = #documents
						n = #documents containg candidate
						tf = Normalized termfrequency of candidate
					*/
															
					var idf = Math.log(d/n);
					if(o.caption.match(/^[A-Za-z0-9\s]+$/))
						weights.push({w: tf * idf, ngram: o.caption, idf: idf, n: n, tf: tf});
				});
								
				//Sort weights
				weights.sort((a, b) => {
					return b.w - a.w;
				});
				
				/*
				Only extract elements with a value > t[n]	
				*/
				
				console.log(weights.slice(0, 10));
				
				var keywords = [];
				
				//Use the top 3 elements as keywords
				for(var c of weights){
					if(_.isUndefined(t[nsize]))break;
					if(c.w < t[nsize])break;
					
					keywords.push(c.ngram);
				}
				
				/*weights.slice(0, 3).forEach((c) => {
					keywords.push(c.ngram);
				});	*/			
				
				/*var c = weights.shift()
					keywords = []
					;
									
				while(c.w > t){
					keywords.push(c.ngram);
					
					if(weights.length == 0)break;
					c = weights.shift();
				}*/
								
				console.log('Keywords', keywords);
				
				setImmediate(() => callback(null, keywords));
			});
		});
	}
	
	this.getKeywords = getKeywords;
}
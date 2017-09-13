var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, path = require('path')
	;

module.exports = function(){
	var options = {
		path: path.join(__dirname,'/../..', '/data/stopwords/german.txt')
	}
	, stopwords = {}
	;
	
	if(arguments[0])
		options = _.defaults(arguments[0], options);
	
	/*
		Read stopword file
		
		Comments begin with vertical bar. Each stop | word is at the start of a line.
		Source: Snowball (http://snowball.tartarus.org/algorithms/german/stop.txt)
		
			stopword | comment
			stopword2
			
			|comment
			stopword3 | comment3
	*/
	function readStopwords(){
		fs.readFileSync(options.path).toString().split("\n").forEach((row) => {
				row = row.split("|"); //Remove comments
				stopword = row[0].replace(/^\s+/g,'').replace(/\s+$/g,'');
				if(stopword.length > 0)
					stopwords[stopword] = true;
			});
			
		console.log('Read ' + _.keys(stopwords).length + ' stopwords from ' + options.path);
	}
	
	if(!_.isEmpty(options.stopwords))
		stopwords = options.stopwords;
	else
		readStopwords();
	
	
	function is(token){
		return !_.isUndefined(stopwords[token.toLowerCase()]);
	}
	
	this.is = is;
}
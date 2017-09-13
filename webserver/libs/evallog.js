var fs = require('fs')
	;

module.exports = function(){
	function log(msg){
		//Used for logging events during evaluation
		/*fs.appendFile('./data/logs/log.txt', "\n" + (new Date()) + ' ' + msg, function (err) {
			console.log(err);
		});*/
	}
	
	this.log = log;
}
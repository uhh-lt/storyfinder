var fs = require('fs')
	, _ = require('lodash')
	;
	
module.exports = function(treefile){
	if(!fs.existsSync(treefile))
		throw new Error('Treefile not found: ' + treefile);
		
	var trees = fs.readFileSync(treefile).toString().split('\n---\n');
	
	/*
	Parse the treefile and create an object for every tree
	*/
	function parseTrees(){
		console.log('Parsing trees in ' + treefile);
		for(var t in trees){
			trees[t] = parseTree(trees[t]);
		}
		console.log('Done parsing trees');
	}
	
	function parseTree(tree){
		var lvl = 0;
		var rows = tree.split("\n");
		var parsed = [];
		
		for(var row of rows){
			var m = row.match(/(\|   )+/g);
			if(m === null)
				lvl = 0;
			else{
				lvl = m[0].length / 4;
				row = row.substr(m[0].length);
			}
						
			var className = null;
			var leaf = row.match(/ : (\d+) \(\d+\/\d+\)$/);
			if(leaf !== null){
				//Leaf
				className = parseInt(leaf[1]);
				row = row.substr(0, row.length - leaf[0].length);
			}
			
			var condition = row.match(/^([a-zA-Z0-9\-\_]+) ([\<\>\=]+) ([\-]?\d+(\.\d+)?)/);
			var el = {
				key: condition[1],
				relation: condition[2],
				value: parseFloat(condition[3])
			};
			
			if(className !== null){
				el.className = className;
			}else
				el.children = [];
			
			var tgt = parsed;
			for(var l = 0; l < lvl; l++)
				tgt = tgt[tgt.length - 1].children;
			tgt.push(el);
		}
		
		return parsed;
	}

	/*
	Classify the given data	by testing all trees and using the maximum predicted class
	*/
	function classify(data){
		var classes = {};
		for(var tree of trees){
			c = test(tree, data);
			
			if(_.isUndefined(classes[c]))
				classes[c] = {
					classname: c,
					votes: 0
				};
				
			classes[c].votes++;
			
			console.log(classes);
		}
		
		classes = _.values(classes);
		
		classes.sort((a, b) => {
			return a.votes - b.votes;
		});
		
		//console.log(classes);	
		
		return classes[0].classname;
	}
	
	/*
		Classify the data with the given tree
	*/
	function test(tree, data){
		var conditions = _.clone(tree);
		
		do{
			var hasMatch = false;

			for(var condition of conditions){
				if(typeof data[condition.key] === 'undefined'){
					console.log('Data has no key ' + condition.key, data);
					continue;
				}
				
				switch(condition.relation){
					case '<':
						//console.log(data[condition.key] + ' < ' + condition.value);
						if(!(data[condition.key] < condition.value))continue;
					break;
					case '<=':
						//console.log(data[condition.key] + ' <= ' + condition.value);
						if(!(data[condition.key] <= condition.value))continue;
					break;
					case '>':
						//console.log(data[condition.key] + ' > ' + condition.value);
						if(!(data[condition.key] > condition.value))continue;
					break;
					case '>=':
						//console.log(data[condition.key] + ' >= ' + condition.value);
						if(!(data[condition.key] >= condition.value))continue;
					break;
					default:
						throw new Error('Unknown relation in tree: ', condition.relation, condition);
				}
				
				if(typeof condition.className !== 'undefined')
					return condition.className;
				
				conditions = condition.children;
				hasMatch = true;
				break;
			}
			
			if(!hasMatch){
				console.log(conditions);
				throw new Error('No match in conditions', conditions);
			}
		}while(hasMatch);
	}
	
	this.classify = classify;
	parseTrees();
}
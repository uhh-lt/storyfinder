var d3 = require('d3')
	, _ = require('lodash')
	;

var lineFunction = d3.svg.line()
				.x(function (d) { return _.isNull(d)?0:d.x; })
				.y(function (d) { return _.isNull(d)?0:d.y; })
				.interpolate("basis");

module.exports = function(l, r){
	var left = {x: l.x, y: l.y}
		, right = {x: r.x, y: r.y}
		;
	
	if(left.x < right.x){
		var t = left;
		left = right;
		right = t;
	}
	
	var lineData = [];
   	
   	lineData.push({
			x: left.x,
			y: left.y
		});
   	
   	lineData.push({
			x: left.x + (right.x - left.x) * 0.25,
			y: right.y + (left.y - right.y) * 0.25
		});
   	
   	lineData.push({
	   	x: right.x,
	   	y: right.y
   	});
   	
   	lineData = _.reverse(lineData);
   			
	return lineFunction(lineData);
};
var _ = require('lodash')
	, async = require('async')
	, smoothLine = require('../helpers/smoothLine.js')
	, d3 = require('d3')
	;

module.exports = function(options, elNew, elExisting, renderGraph, node, label, link){
	function getScalingFactor(d){
		if(!_.isUndefined(d.focused) && d.focused == true && !_.isUndefined(d.tfidf) && !_.isNaN(d.tfidf))
			return d.tfidf;
		return d.pageRank;
	}
	
	/*
		Bereits vorhandene Nodes und Links zur neuen Position bewegen
	*/
	function moveExisting(done){
		console.log(3);
		async.parallel([
			function(doneTransition){
				var n = 0;
				var transition = elExisting.labels
					.attr('transform', function(d){
						if(!_.isUndefined(d.prevData)){
							return 'translate(' + Math.round(d.prevData.x) + ',' + Math.round(d.prevData.y) + ') scale(' + (getScalingFactor(d.prevData) / 2 + 0.75) + ')';
						}else{
							return 'translate(' + Math.round(d.x) + ',' + Math.round(d.y) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) + ')';
						}
					})
					.transition()
					.duration(options.transitionUpdate)
					.attrTween('transform', function(d,i,a){
						var x = [d.x, d.x]
							, y = [d.y, d.y]
							, p = [getScalingFactor(d), getScalingFactor(d)]
							;
											
						if(!_.isUndefined(d.prevData)){
							x[0] = d.prevData.x;
							y[0] = d.prevData.y;
							p[0] = getScalingFactor(d.prevData);
						}
						
						return function(t){
							var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ') scale(' + (Math.round(p[0] * (1 - t) + p[1] * t) / 2 + 0.75) + ')';
							return ret;
						}
					}).each('end', function(){
						if(transition.size() == ++n){
							console.log('transition ended');
							doneTransition();
						}
					});
					
				if(transition.size() == 0)
					doneTransition();
			},
			function(doneTransition){
				var n = 0;
				var transition = elExisting.links.selectAll('path')
					.attr('d', function(d){
						var sx = d.source.x
							, sy = d.source.y
							, tx = d.target.x
							, ty = d.target.y
							;
						
						if(!_.isUndefined(d.source.prevData)){
							sx = d.source.prevData.x;
							sy = d.source.prevData.y;
						}
						
						if(!_.isUndefined(d.target.prevData)){
							tx = d.target.prevData.x;
							ty = d.target.prevData.y;
						}
						
						return smoothLine({x: sx, y: sy}, {x:tx, y:ty});
					})
					.transition()
					.duration(options.transitionUpdate)
					.attrTween('d', function(d,i,a){
						var sx = [d.source.x, d.source.x]
							, sy = [d.source.y, d.source.y]
							, tx = [d.target.x, d.target.x]
							, ty = [d.target.y, d.target.y]
							;
						
						if(!_.isUndefined(d.source.prevData)){
							sx[0] = d.source.prevData.x;
							sy[0] = d.source.prevData.y;
						}
						
						if(!_.isUndefined(d.target.prevData)){
							tx[0] = d.target.prevData.x;
							ty[0] = d.target.prevData.y;
						}
															
						return function(t){
							
							
							return smoothLine(
								{
									x: Math.round(sx[0] * (1 - t) + sx[1] * t), 
									y: Math.round(sy[0] * (1 - t) + sy[1] * t)
								}, 
								{
									x:Math.round(tx[0] * (1 - t) + tx[1] * t),
									y:Math.round(ty[0] * (1 - t) + ty[1] * t)
								});
						}
					}).each('end', function(){
						if(transition.size() == ++n){
							console.log('link transition ended');
							doneTransition();
						}
					});
				if(transition.size() == 0)
					doneTransition();
			}
		], function(){
			console.log('Done transition');
			setTimeout(done, 0);
		});
	}
	
	this.moveExisting = moveExisting;
}
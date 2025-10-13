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
		Neue Knoten und links einblenden
	*/
	function showNew(){
		var done = arguments[arguments.length - 1];
		var srcNode = null
			, srcData = null
			, srcId = null
			;
		
		if(arguments.length > 1){
			srcId = arguments[0];
			
			srcNode = label.filter(function(d){
				if(d.id == srcId)return true;
				return false;
			});
			srcData = srcNode.datum();
		}
		
		async.parallel([
			function(doneTransition){
				var n = 0;
				var transition = elNew.labels
					.attr('transform', function(d){
						if(_.isNull(srcData))
							return 'translate(' + (options.width + d.width) + ',' + Math.round(d.y) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) + ')';
						else
							return 'translate(' + srcData.x + ',' + srcData.y + ') scale(' + 0 + ')';
					})
					.transition()
					.duration(options.transitionAdd)
					.delay(function(d, i){
						if(_.isNull(srcNode))return 0;
						return i * 50;
					})
					.ease('bounce')
					.attrTween('transform', function(d, i, a){
						var x = [options.width + d.width, d.x]
							, y = [d.y, d.y]
							, p = [(getScalingFactor(d) / 2 + 0.75), (getScalingFactor(d) / 2 + 0.75)]
							;
						
						if(!_.isNull(srcData)){
							x[0] = srcData.x;
							y[0] = srcData.y;
							p[0] = 0;
						}
						
						return function(t){
							var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ') scale(' + (Math.round(p[0] * (1 - t) + p[1] * t)) + ')';
							return ret;
						}
					})
					.attr('opacity', 1)
					.each('end', function(){
						if(transition.size() == ++n)
							doneTransition();
					});
					
				if(transition.size() == 0)
					doneTransition();
			},
			function(doneTransition){
				var n = 0;
				var transition = elNew.nodes
					.attr('transform', function(d){
						return 'translate(' + Math.round(d.x) + ',' + Math.round(d.y) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) + ')';
					})
					.transition()
					.duration(options.transitionAdd)
					.attr('opacity', 1)
					.each('end', function(){
						if(transition.size() == ++n)
							doneTransition();
					});
					
				if(transition.size() == 0)
					doneTransition();
			},
			function(doneTransition){
				var n = 0;
				elNew.links
					.selectAll('path')
					.attr('d', function(d){
						var sx = d.source.x
							, sy = d.source.y
							, tx = d.target.x
							, ty = d.target.y
							;
							
						return smoothLine({x: sx, y: sy}, {x:tx, y:ty});
					});
				
				var transition = elNew.links
					.attr('opacity', 0)
					.transition()
					.delay(function(d, i){
						if(_.isNull(srcNode))return 0;
						return i * 50;
					})
					.duration(options.transitionAdd)
					.attr('opacity', 1)
					.each('end', function(){
						if(transition.size() == ++n)
							doneTransition();
					});
					
				if(transition.size() == 0)
					doneTransition();
			}
		], done);
	}
	
	this.showNew = showNew;
}
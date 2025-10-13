var _ = require('lodash')
	, async = require('async')
	;

module.exports = function(options, renderGraph, node, label, link){
	function getScalingFactor(d){
		if(!_.isUndefined(d.focused) && d.focused == true && !_.isUndefined(d.tfidf) && !_.isNaN(d.tfidf))
			return d.tfidf;
		return d.pageRank;
	}
	
	/*
		Geloeschte Elemente im Graphen ausblenden	
	*/
	function removeDeleted(){
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
		
		if(_.isNull(node) || _.isNull(label) || _.isNull(link)){
			done();
		}else{
			var removeA = {};
			if(!_.isUndefined(renderGraph.remove))
				renderGraph.remove.forEach(function(id){
					removeA[id] = true;
				});
			
			//Alte Nodes und Links entfernen
			var nodesToRemove = node.filter(function(d){
				return !_.isUndefined(removeA[d.id]);
			});
			
			var labelsToRemove = label.filter(function(d){
				return !_.isUndefined(removeA[d.id]);
			});
			
			var linksToRemove = link.filter(function(d){
				return !_.isUndefined(removeA[d.source.id]) || !_.isUndefined(removeA[d.target.id]);
			});
	
			async.parallel([
				function(doneTransition){
					var n = 0;
					var transition = labelsToRemove
						.transition()
						.duration(options.transitionRemove)
						.attrTween('transform', function(d, i, a){
							var x = [d.x, -1 * d.width + 2]
								, y = [d.y, d.y]
								;
								
							if(!_.isNull(srcData)){
								x[1] = srcData.x;
								y[1] = srcData.y;
							}
							
							return function(t){
								var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) + ')';
								return ret;
							}
						})
						.attr('opacity', _.isNull(srcData)?1:0)
						.each('end', function(){
							if(transition.size() == ++n)
								doneTransition()
						});
						
					if(transition.size() == 0)
						doneTransition();
				},
				function(doneTransition){
					var n = 0;
					var transition = linksToRemove
						.transition()
						.duration(options.transitionRemove)
						.attr('opacity', 0)
						.each('end', function(){
							if(transition.size() == ++n)
								doneTransition()
						});
					
					if(transition.size() == 0)
						doneTransition();
				}
			], function(){
				console.log('Done removing');
				setTimeout(done, 0);
			});
		}
	}
	
	this.removeDeleted = removeDeleted;
}
var d3 = require('d3')
	, cola = require('./libs/cola.js')
	, _ = require('lodash')
	, async = require('async')
	, Delegate = require('dom-delegate')
	, smoothLine = require('./vis/helpers/smoothLine.js')
	, TRemoveDeleted = require('./vis/transitions/removeDeleted.js')
	, TApplyNewData = require('./vis/transitions/applyNewData.js')
	, TMoveExisting = require('./vis/transitions/moveExisting.js')
	, TShowNew = require('./vis/transitions/showNew.js')
	, actions = require('./actions/StoryfinderActions.js')
	;
	
	require('es6-promise').polyfill();
	require('isomorphic-fetch');

module.exports = function Vis(store){
	var gG = new (require('./global_graph.js'))(store)
		, width = 960
		, height = 700
		, labelHeight = 10
		, labelPadding = 3
		, labelRadius = 32 //35
		, labelTotalHeight = labelHeight + 2 * labelPadding
		, maxFontSize = 12
		, minFontSize = 12
		, node = null
		, link = null
		, label = null
		, svgSelector = 'svg'
		, nodeAttr = ['caption', 'count', 'height', 'id', 'isTopNode', 'index', 'pageRank', 'tfidf', 'type', 'width', 'x', 'y', 'prevData', 'more', 'focused', 'isExpanded']
		, renderNodes = []
		, d3cola = null
		, elNew = null
		, elExisting = null
		, renderGraph = null
		, transitionUpdate = 300
		, transitionAdd = 300
		, transitionRemove = 500
		, transitionCard = 700
		, transitionDetails = 700
		, oWidth = 150
		, oHeight = 150
		, defs = null
		, backgroundGradient = null
		, currentBackground = '#FFFFFF'
		, typeToCaption = {
			ORG: 'Organisation',
			PER: 'Person',
			LOC: 'Location',
			OTH: 'Other'
		}
		, colors = ('#F44366, #E91E63, #9C27B0, #673AB7, #3F51B5, #2196F3, #03A9F4, #00BCD4, #009688, #4CAF50, #8BC34A, #FFC107, #FF9800, #FF5722, #795548').split(', ')
		, colors2 = ('#D32F2F, #C2185B, #7B1FA2, #512DA8, #303F9F, #1976D2, #0288D1, #0097A7, #00796B, #388E3C, #689F38, #FFA000, #F57C00, #E64A19, #5D4037').split(', ')
		, colors3 = ('#FFCDD2, #F8BBD0, #E1BEE7, #D1C4E9, #C5CAE9, #BBDEFB, #B3E5FC, #B2EBF2, #B2DFDB, #C8E6C9, #DCEDC8, #FFECB3, #FFE0B2, #FFCCBC, #D7CCC8').split(', ')
			//Cards
		, textPadding = 15
		, cardWidth = 110
		, cardHeight = 70
		, btnRadius = 15
		, cardPadding = 15
		, detailsNode = null
		, labelHover = null
		, labelDragged = null
		, dragOverDelete = null
		, currentNode = null
		, maxFocus = 15
		, maxNeighbours = 0
		, bShowLinklabels = true
		, cardactions = {
			link: {
				value: '\ue157'
			},
			expand: {
				value: '\ue145'
			},
			more: {
				value: '\ue895'
			}
		}
		, nodeTypes = ['ORG', 'PER', 'LOC', 'OTH']
		, typeColors = {
			ORG: 1,
			OTH: 3,
			PER: 6,
			LOC: 9
		}
		, nodeLink = null
		, linkHighlighted = null
		, minLinkDistance = 30
		, maxLinkDistance = 40
		, minLabelRadius = 21 //20
		, bKeepInViewport = true
		, userId = store.getState().config.get('user-id')
		, q = async.queue(function(task, callback) {
		    task.args[task.args.length - 1] = () => {
			 	//console.log('Calling callback', callback);
			    setTimeout(callback, 100);
			    			    
			    if(_.isFunction(task.callback)){
			    	setTimeout(task.callback, 200);
			    }
			};
		    
		    //console.log('Apply', task.args);
		    
		    task.f.apply(task.context, task.args);
		}, 1);
		;
	
	var svg = d3.select(svgSelector)
		, visDelegate = new Delegate(svg.node())
		, bb = d3.select('.graph-container').node().getBoundingClientRect()
		, bbTitle = d3.select('.graph-title').node().getBoundingClientRect()
		;
		
	function handleResize(){
		svg.style.display = 'none';
		var sitelist = d3.select('.websites > .site-list');
		sitelist.style('display', 'none');
		
		bb = d3.select('.graph-container').node().getBoundingClientRect();
		bbTitle = d3.select('.graph-title').node().getBoundingClientRect();
		width = bb.width;
		height = Math.max(window.innerHeight - bb.top - bbTitle.height - 20, 260);
		d3.select('.graph-container').node().style.height = (height + bbTitle.height) + 'px';
		sitelist.style('height', (height) + 'px');
		sitelist.style('display', 'block');
		labelRadius = Math.min(labelRadius, Math.max(minLabelRadius, Math.max(width, height) / 50));
					
		var maxElements = Math.ceil((width * height) / ((labelRadius * 4 * labelRadius) * 11));
		
		if(maxElements >= 24)
			maxNeighbours = 2;
		else if(maxElements > 16)
			maxNeighbours = 1;
		
		if(height < 500)
			maxElements = maxElements / 1.5;
		maxFocus = maxElements / (1 + maxNeighbours);
		
		svg.attr("width", width)
		.attr("height", height);
		svg.style.display = 'block';
		if(!_.isUndefined(gAdd))
			gAdd.attr('transform', 'translate(' + (width - 58) + ', ' + (height - 58) + '), scale(2)');
			
		if(!_.isUndefined(gBackground))
			gBackground.select('rect').attr('width', width).attr('height', height)
	}
		
	handleResize();
	this.handleResize = handleResize;
	//maxFocus = 15;
	
	/*if(width < 300){
		maxNeighbours = 1;
		maxFocus = 10;
	}else if(width < 500){
		maxNeighbours = 1;
		maxFocus = 15;
	}*/
	
	var options = {
		width: width,
		height: height,
		labelRadius: labelRadius,
		labelHeight: labelHeight,
		labelPadding: labelPadding,
		maxFontSize: maxFontSize,
		minFontSize: minFontSize,
		labelTotalHeight: labelTotalHeight,
		transitionUpdate: transitionUpdate,
		transitionRemove: transitionRemove,
		transitionAdd: transitionAdd,
		transitionCard: transitionCard,
		transitionDetails: transitionDetails,
		typeToCaption: typeToCaption,
		cardactions: cardactions,
		nodeTypes: nodeTypes,
		typeColors: typeColors,
		colors: colors,
		colors2: colors2,
		colors3: colors3,
		bShowLinklabels: bShowLinklabels
	};
	
	defs = svg.append('defs');
	/*backgroundGradient = defs.append('radialGradient')
		.attr('id', 'background-gradient')
		.attr('cx', 0)
		.attr('cy', 0)
		.attr('r', '100%')
		;
	backgroundGradient.append('stop')
		.attr('offset', '0%')
		.style('stop-color','rgb(255,255,255)')
		;
	backgroundGradient.append('stop')
		.attr('offset', '25%')
		.style('stop-color','rgb(255,255,255)')
		;
	backgroundGradient.append('stop')
		.attr('offset', '25.01%')
		.style('stop-color','rgb(255,255,255)')
		;				
	backgroundGradient.append('stop')
		.attr('offset', '50%')
		.style('stop-color','rgb(255,255,255)')
		;
	backgroundGradient.append('stop')
		.attr('offset', '50.01%')
		.style('stop-color','rgb(255,255,255)')
		;
	backgroundGradient.append('stop')
		.attr('offset', '100%')
		.style('stop-color','rgb(255,255,255)')
		;*/
	
	var gBackground = svg.append('g')
		, gSelected = svg.append('g')
		, gDelete = svg.append('g').attr('class', 'delete-target').attr('transform', 'scale(2)')
		, gLinks = svg.append('g')
		, gNodes = svg.append('g')
		, gLabels = svg.append('g')
		, gAdd = svg.append('g').attr('class', 'add-target').attr('transform', 'scale(2)')
		;
		
	gBackground.attr('class', 'background').append('rect').attr('width', width).attr('height', height)
		.attr('fill', 'url(#background-gradient)');
	
	gDelete.append('path').attr('d', 'M0 0h24v24H0V0z').attr('fill', 'none');
	gDelete.append('path').attr('d', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z');
	gDelete.append('path').attr('d', 'M0 0h24v24H0z').attr('fill', 'none');
	
	gAdd.append('path').attr('d', 'M0 0h24v24H0z').attr('fill', 'none');
	gAdd.append('circle').attr('cx', 12).attr('cy', 12).attr('r', 8).attr('fill', '#FFFFFF');
	gAdd.append('path').attr('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z');
	gAdd.attr('transform', 'translate(' + (width - 58) + ', ' + (height - 58) + '), scale(2)');
	
	/*
	Delegates	
	*/
	visDelegate.on('mouseover', '.label', function(){
		if(!_.isNull(labelDragged)){
			this.className.baseVal += ' dragover';
			var data = d3.select(this).datum();
			labelHover = data.id;
			
			//console.log('Hover ' + data.id + ' / ' + data.caption);
		}
		
		if(!_.isNull(nodeLink)){
			var linkSrc = nodeLink;
			var linkTgt = d3.select(this).datum();
			
			if(linkSrc.id != linkTgt.id){
				this.className.baseVal += ' linkover';
										
				link.each(function(d){				
					if((d.source.id == linkTgt.id && d.target.id == linkSrc.id) || (d.source.id == linkSrc.id && d.target.id == linkTgt.id)){
						var el = d3.select(this);
						el.attr('class', el.attr('class') + ' linkover');
						linkHighlighted = el;
					}
				});
			}
		}
	});
	
	visDelegate.on('mouseover', '.delete-target', function(){
		if(!_.isNull(labelDragged)){
			this.className.baseVal += ' dragover';
			dragOverDelete = true;
		}
	});
	
	visDelegate.on('mouseout', '.delete-target', function(){
		if(!_.isNull(labelDragged)){
			this.className.baseVal = this.className.baseVal.replace(/\sdragover/g,'').replace(/^dragover/g, '');
			
			dragOverDelete = null;
		}
	});
	
	visDelegate.on('touchenter', '.label', function(){
		if(!_.isNull(labelDragged)){
			this.className.baseVal += ' dragover';
			var data = d3.select(this).datum();
			labelHover = data.id;
			
			//console.log('Hover ' + data.id + ' / ' + data.caption);
		}
	});
	
	visDelegate.on('mouseout', '.label', function(){
		if(!_.isNull(labelDragged)){
			this.className.baseVal = this.className.baseVal.replace(/\sdragover/g,'').replace(/^dragover/g, '');
			var data = d3.select(this).datum();
			
			if(labelHover == data.id)
				labelHover = null;
			
			//console.log('Out ' + data.id + ' / ' + data.caption);
		}
		
		if(!_.isNull(nodeLink)){
			if(!_.isNull(linkHighlighted)){
				linkHighlighted.attr('class', linkHighlighted.attr('class').replace(/\slinkover/g,'').replace(/^linkover/g, ''))
			}
			this.className.baseVal = this.className.baseVal.replace(/\slinkover/g,'').replace(/^linkover/g, '');
		}
	});
		
	var removeDeleted = function(){
		var container = new TRemoveDeleted(options, renderGraph, node, label, link);
		
		container.removeDeleted.apply(this, arguments);
	}
	
	var applyNewData = function(){
		var container = new TApplyNewData(options, elNew, elExisting, renderGraph, node, label, link);
		
		container.applyNewData.apply(this, arguments);
	}
	
	var moveExisting = function(){
		var container = new TMoveExisting(options, elNew, elExisting, renderGraph, node, label, link);
		
		container.moveExisting.apply(this, arguments);
	}
	
	var showNew = function(){
		var container = new TShowNew(options, elNew, elExisting, renderGraph, node, label, link);
		
		container.showNew.apply(this, arguments);
	}
	
	function tick(){			
		node
			.attr("cx", function (d) { 
				if(!bKeepInViewport)
					return d.x;
				
				/*if(d.x > width - 100 && d.y > height - 100)
					d.x = width - 100;
					
				if(d.x < 100 && d.y < 100)
					d.x = 100;*/
				
				return d.x = Math.max(10, Math.min(width, d.x)); 
			})
			.attr("cy", function (d) { 
				if(!bKeepInViewport)
					return d.y;
				
				/*if(d.x > width - 100 && d.y > height - 100)
					d.y = height - 100;*/
				
				return d.y = Math.max(10, Math.min(height, d.y));
			})
			.attr('width', function(d){ return d.width + 10 })
			.attr('height', labelHeight);
			;
				
		link.selectAll('path').attr('d', function(d){
			return smoothLine(d.source, d.target);
		});
					
		label.attr('transform', function(d){		
			return 'translate(' + Math.round(d.x) + ',' + Math.round(d.y) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) /*(Math.pow(Math.E, (getScalingFactor(d) - 1)) * 3)*/ + ')';
		});
	}
	
	/*
		Neues Layout berechnen	
	*/
	function calculateNewLayout(done){
		//layout berechnen
		var layoutNodes = renderNodes.slice(0);
		
		var topLeft = { x: 0, y: 0, fixed: true }
		    , tlIndex = layoutNodes.push(topLeft) - 1
		    , bottomRight = { x: width, y: height, fixed: true }
		    , brIndex = layoutNodes.push(bottomRight) - 1
			;
		
		//Focus nodes befinden sich im Zentrum
		var constraints = [];
		
		if(bKeepInViewport){
			for(var i = 0; i < renderNodes.length; i++){
				constraints.push({ axis: 'x', type: 'separation', left: tlIndex, right: i, gap: labelRadius + 5 });
				constraints.push({ axis: 'y', type: 'separation', left: tlIndex, right: i, gap: labelRadius + 5 });
				constraints.push({ axis: 'x', type: 'separation', left: i, right: brIndex, gap: labelRadius + 5 });
				constraints.push({ axis: 'y', type: 'separation', left: i, right: brIndex, gap: labelRadius + 5 });
			}
		}
				
		/*layoutNodes.forEach(function(d){
			var pagerank = 0.5;
			
			if(!_.isUndefined(getScalingFactor(d)))
				pagerank = getScalingFactor(d);
				
			pagerank = pagerank / 2 + 0.75;
			
			console.log(pagerank);
			
			d.width = options.labelRadius * pagerank * 2 + 20;
			d.height = options.labelRadius * pagerank * 2 + 20;
			console.log(d.width, d.height);
		});*/
		
		/*var linkDistance = 20 + (width * height) / 40000 - layoutNodes.length / 8;
		linkDistance = Math.max(minLinkDistance, linkDistance);*/
		var freeSpace = (width * height) - layoutNodes.length * (labelRadius * 4 * labelRadius) * 11;
		//Put every element equally on the free space
		
		var linkDistance = minLinkDistance;
		
		if(freeSpace > 0){			
			var squares = freeSpace / layoutNodes.length;
			var squareL = Math.sqrt(squares);
			linkDistance = squareL;
		}
		
		//console.log(linkDistance, minLinkDistance);
		
		//var linkDistance = ...
		linkDistance = Math.min(maxLinkDistance, Math.max(minLinkDistance, linkDistance));
						
		d3cola.nodes(layoutNodes)
			.links(renderGraph.links)
			.constraints(constraints)
			//.jaccardDiffLinkLengths(linkDistance)
			.symmetricDiffLinkLengths(linkDistance)
			.avoidOverlaps(true)
			.size([width, height])
			.start(10, 20, 20, false, true)
			;

		d3cola.stop();
		
		/*
			Neue Daten setzen	
		*/			
		link = gLinks.selectAll(".link")
			.data(renderGraph.links)
			;
		
		node = gNodes.selectAll(".node")
			.data(renderNodes)
			;
		
		label = gLabels.selectAll(".label")
			.data(renderNodes)
			;
		
		/*
		Nicht mehr benoetigte Links und Knoten loeschen	
		*/
		link.exit().remove();
		node.exit().remove();
		label.exit().remove();
		
		setTimeout(done, 0);
	}
	
	function toggleLinkMode(el){
		var node = d3.select(el)
			, nodeData = node.datum()
			, btn = node.select('.actions-link')
			;
			
		if(!_.isNull(nodeLink)){
			btn.attr('class', btn.attr('class').replace(/^active/, '').replace(/\sactive/, ''));
			nodeLink = null;
		}else{
			btn.attr('class', btn.attr('class') + ' active');
			nodeLink = nodeData;
		}
	}
	
	this.toggleLinkMode = toggleLinkMode;
		
	function merge(tgt, src, callback){
		console.log("Merge!");
		setData();
		
		removeSelection();
		//closeNode(el);
		
		//var id = d3.select(el).datum().id;
		//console.log('Merging ' + src + ' -> ' + tgt);
		gG.mergeNodes(tgt, src);
		
		fetch('/Entities/' + tgt + '/' + src, {
			method: 'PUT',
			credentials: 'same-origin'
		})
	    .then(function(response) {
	        if (response.status >= 400) {
	            throw new Error("Bad response from server");
	        }
	        return response.json();
	    })
	    .then(function(json) {
	        //console.log(json);
	    });
		
		//Knoten nicht neu Ranken, ansonsten werden ggf. weitere Knoten ausgeblendet!
		gG.rankNodes();
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor();
			console.log("d3cola merge");
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				}
			], function(){				
				d3cola.on('tick', tick);
				d3cola.resume();
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	/*store.subscribe(() => {
		var state = store.getState().storyfinder;
		switch(state.get('state')){
			
		}
	});*/
	
	function deleteNode(el, callback){
		var id = d3.select(el).datum().id;
		
		//store.dispatch(actions.deleteNode(userId, id));
		
		d3.select('.delete-target').attr('class', d3.select('.delete-target').attr('class').replace(/dragover/, ''));
		dragOverDelete = false;
		
		setData();
		removeSelection();
		
		fetch('/Entities/' + id, {
			method: 'DELETE',
			credentials: 'same-origin'
		})
	    .then(function(response) {
	        if (response.status >= 400) {
	            throw new Error("Bad response from server");
	        }
	        return response.json();
	    })
	    .then(function(json) {
	        //console.log(json);
	    });
	    
		closeNode(el);
		
		console.log('Deleting ' + id);
		gG.deleteNode(id);
		//Knoten nicht neu Ranken, ansonsten werden ggf. weitere Knoten ausgeblendet!
		//gG.rankNodes();
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor();
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				}
			], function(){				
				d3cola.on('tick', tick);
				d3cola.resume();
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	this.deleteNode = deleteNode;
	
	function toggleNode(el, callback){
		var data = d3.select(el).datum()
			, id = data.id
			;
		
		if(data.more > 0){
			expandNode(el, callback);
		}else{
			collapseNode(el, callback);
		}
	}
	
	this.toggleNode = toggleNode;
	
	function collapseNode(el, callback){
		var data = d3.select(el).datum()
			, id = data.id
			;

		setData();
		
		//console.log('Collapsing ' + id);
		gG.rankNodes();
		gG.collapse(id)
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				function(done){
					removeDeleted(id, done)
				},
				calculateNewLayout,
				function(done){
					applyNewData(id, done);
				},
				function(done){
					async.series([
						moveExisting,
						function(callback){
							showNew(id, callback);
						}
					], done);
				}
			], function(){
				d3cola.on('tick', tick);
				d3cola.resume();
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	function expandNode(el, callback){
		var data = d3.select(el).datum()
			, id = data.id
			;
		
		setData();
				
		//console.log('Expanding ' + id);
		gG.rankNodes();
		gG.expand(id)
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				function(done){
					applyNewData(id, done);
				},
				function(done){
					async.series([
						moveExisting,
						function(callback){
							showNew(id, callback);
						}
					], done);
				}
			], function(){
				d3cola.on('tick', tick);
				d3cola.resume();
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	this.expandNode = expandNode;
	
	function hideDetails(){
		var nodeData = detailsNode.datum()
			, details = d3.select('.node-details')
			;
			
		var pos = svg.node().parentNode.getBoundingClientRect();
		
		details.select('.caption').text(nodeData.caption);
		details.select('small').text(typeToCaption[nodeData.type]);
		
		details
			.attr('class', 'node-details type-' + nodeData.type)
			.style('opacity', 1)
			.transition()
			.ease('elastic')
			.duration(transitionDetails)	
			.style('left', (nodeData.x) + 'px')
			.style('top', (nodeData.y) + 'px')
			.style('width', '0px')
			.style('height', '0px')
			.each('end', function(){
				details.style('display', 'none');
				//details.transition().duration(300).style('opacity', 0);
			})
			;
		//details.transition().duration(transitionDetails).style('opacity', 0);
	}
	
	this.hideDetails = hideDetails;
	
	function showDetails(el, callback){
		detailsNode = d3.select(el);
					
		var nodeData = detailsNode.datum()
			, details = d3.select('.node-details')
			;
		
		details.attr('data-id', nodeData.id);
		
		details.node().querySelector('.content-body').innerHTML = '<i class="fa fa-spinner fa-spin fa-3x"></i>';
			
		var pos = svg.node().parentNode.getBoundingClientRect();
		
		details.select('.caption').text(nodeData.caption);
		details.select('small').text(typeToCaption[nodeData.type]);
		
		details
			.style('display', 'block')
			.style('opacity', 1)
			.attr('class', 'node-details type-' + nodeData.type)
			.style('left', (nodeData.x - cardWidth / 2) + 'px')
			.style('top', (nodeData.y + cardHeight / 2) + 'px')
			.style('width', cardWidth + 'px')
			.style('height', cardHeight + 'px')
			.transition()
			.duration(transitionDetails)
			.ease('elastic')			
			.style('left', '0px')
			.style('top', '0px')
			.style('width', pos.width + 'px')
			.style('height', pos.height + 'px')
			.each('end', function(){
				if(!_.isUndefined(callback) && _.isFunction(callback)){
					callback(details.node(), nodeData);
				}
			})
			;
	}
	
	this.showDetails = showDetails;
	
	function showDelete(){
		gDelete.transition().style('opacity', 1);
	}
	
	function hideDelete(){
		gDelete.transition().style('opacity', 0);
	}
	
	function getScalingFactor(d){
		if(!_.isUndefined(d.focused) && d.focused == true && !_.isUndefined(d.tfidf) && !_.isNaN(d.tfidf))
			return d.tfidf;
		return d.pageRank;
	}
	
	function showCard(node, nodeData){
		var card = node.select('g.card')
			, cardBg = null
			, cardTitlebar = null
			, cardTitle = null
			, cardSubtitle = null
			, cardCtrls = null
			, btnClose = null
			, actionBtns = {}
			;
						
		if(card.length == 0 || card[0].length == 0 || card[0][0] == null){
			card = node.insert('g',':first-child')
				.attr('class', 'card');
		
			cardBg = card.append('rect')
				.attr('class', 'background');
			
			cardTitlebar = card.append('rect');
			
			cardTitle = card.append('text')
				.attr('class', 'title')
				;
		
			cardSubtitle = card.append('text')
				.attr('class', 'subtitle')
				;
				
			var btnClose = card.append('g')
				.attr('class', 'close-card')
				;
			
			btnClose
				.append('rect')
				.attr('width', 24)
				.attr('height', 24)
				.attr('y', -12)
				.attr('x', -12)
				;
			
			btnClose
				.append('text')
				.text('\uf00d')
				.attr('dy', '0.35em')
				;
				
			cardCtrls = card.append('g')
				.attr('class', 'ctrls')
				;
			
			_.forOwn(cardactions, function(val, action){
				actionBtns[action] = cardCtrls.append('g')
					.attr('class', 'actions-' + action)
					;	
				actionBtns[action].append('circle');
				actionBtns[action]
					.append('text')
					.text(val.value)
					.attr('dy', '0.45em')
					;
			});
		}else{
			cardBg = card.select('.background');
			cardTitlebar = card.select('.titlebar');
			cardTitle = card.select('.title');
			cardSubtitle = card.select('.subtitle');
			cardCtrls = card.select('.ctrls');
			btnClose = cardCtrls.select('.close-card');
			
			_.forOwn(cardactions, function(val, action){
				actionBtns[action] = cardCtrls.select('.actions-' + action);
			});
		}
		
		if(nodeData.more == 0){
			actionBtns['expand'].select('text').text('\ue15b');
		}else{
			actionBtns['expand'].select('text').text('\ue145');
		}
		
		card.attr('transform', function(d){
				return 'scale(' + (1 / (getScalingFactor(d) / 2 + 0.75)) + ')';
			});
			;
							
		cardTitlebar
			.attr('class', 'titlebar')
			.attr('width', cardWidth)
			.attr('height', 0)
			.attr('x', cardWidth / -2)
			.attr('y', cardHeight / -2)
			.attr('opacity', 1)
			.transition()
			.ease('elastic')
			.delay(transitionCard)
			.duration(transitionCard)
			.attr('height', 24)
			;
			
		cardBg
			.attr('rx', labelRadius)
			.attr('ry', labelRadius)
			.attr('x', labelRadius * -1)
			.attr('y', labelRadius * -1)
			.attr('width', labelRadius * 2)
			.attr('height', labelRadius * 2)
			.transition()
			.ease('elastic')
			.duration(transitionCard)
			.attr('rx', 0)
			.attr('ry', 0)
			.attr('width', cardWidth)
			.attr('height', cardHeight)
			.attr('x', cardWidth / -2)
			.attr('y', cardHeight / -2)
			;
			
		cardCtrls.attr('opacity', 1);
						
		cardTitle
			.attr('opacity', 1)
			.text(function(d){
				var c = nodeData.caption
					, cOut = c
					, el = d3.select(this)
					;
				
				el.text(c);
				
				while(this.getComputedTextLength() > cardWidth - textPadding * 2){
					c = c.substr(0, c.length - 1);
					cOut = c + '...';
					el.text(cOut);
				}
				
				return cOut;
			})
			.attr('x', -40)
			.attr('y', 4)
			;
			
		cardSubtitle
			.attr('opacity', 1)
			.text(typeToCaption[nodeData.type])
			.attr('x', cardWidth / -2 + cardPadding)
			.attr('y', cardPadding)
			;
		
		var actionIdx = 0;
		_.forOwn(cardactions, function(val, action){
			actionBtns[action].datum({actionIdx: actionIdx});
			
			actionBtns[action].select('circle')
				.attr('r', btnRadius)
				;
				
			actionBtns[action]
				.attr('transform', 'translate(' + (cardWidth / 3 * (actionIdx - 1)) + ', ' + (-1 * (height + btnRadius * 2)) + ')')
				.transition()
				.ease('bounce')
				.delay(transitionCard)
				.duration(transitionCard)
				.attrTween('transform', function(d, i, a){
					var x = [cardWidth / 3 * (d.actionIdx - 1), cardWidth / 3 * (d.actionIdx - 1)]
						, y = [-1 * (height + btnRadius * 2), cardHeight / 2]
						;
					
					return function(t){
						var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ')';
						return ret;
					}
				});
				
			actionIdx++;
		});
				
		btnClose
			.attr('transform', 'translate(' + (cardWidth / 2 - 15) + ', ' + (cardHeight / -2 + 11) + ')');
			;
			
		var drag = d3.behavior.drag();
		card.call(drag);
				
		drag.on('dragstart', function(d, e){

		});
		
		drag.on('drag', function(d, e){
			if(Math.abs(d3.event.dx) > 5 || Math.abs(d3.event.dy) > 5){
				if(_.isNull(labelDragged)){
					d3.select(this).attr('class', d3.select(this).attr('class') + ' dragging');
					labelDragged = d;
					
					showDelete();
				}
			}
		});
		
		drag.on('dragend', function(d, e){
			d3.select(this).attr('class', d3.select(this).attr('class').replace(/\sdragging/g, '').replace(/^dragging/,''));

			if(!_.isNull(labelDragged) && !_.isNull(dragOverDelete)){
				deleteNode(this, function(){
					
				});
			}else if(!_.isNull(labelHover) && !_.isNull(labelDragged) && labelHover != labelDragged.id){
				console.log('Merging ' + labelHover + ' / ' + labelDragged.id);
				merge(labelHover, labelDragged.id);
				labelDragged = null;
			}
			
			labelDragged = null;
			labelHover = null;
			
			hideDelete();
		});
	}
	
	function closeCard(node, nodeData){
		var card = node.select('g.card')
			, cardBg = card.select('.background')
			, cardTitlebar = card.select('.titlebar')
			, cardTitle = card.select('.title')
			, cardSubtitle = card.select('.subtitle')
			, cardCtrls = card.select('.ctrls')
			, btnClose = cardCtrls.select('.close')
			, actionBtns = {}
			;
		
		_.forOwn(cardactions, function(val, action){
			actionBtns[action] = cardCtrls.select('.action-' + action);
		});
		
		card.attr('transform', function(d){
				return 'scale(1)';
			});
			
		cardTitlebar
			.transition()
			.duration(transitionCard / 2)
			.attr('x', 0)
			.attr('y', 0)
			.attr('width', 0)
			.attr('height', 0)
			;
		
		cardBg
			.transition()
			.duration(transitionCard)
			.ease('elastic')
			.attr('rx', labelRadius)
			.attr('ry', labelRadius)
			.attr('x', labelRadius * -1)
			.attr('y', labelRadius * -1)
			.attr('width', labelRadius * 2)
			.attr('height', labelRadius * 2)
			.each('end', function(){
				removeSelection();
			});
			;
		
		cardCtrls
			.transition()
			.duration(transitionCard)
			.attr('opacity', 0)
			;
			
		cardTitle
			.attr('opacity', 0)
			;
		
		cardSubtitle
			.attr('opacity', 0)
			;
	}
	
	function closeAll(){
		if(!_.isNull(currentNode)){
			closeNode(currentNode.el);
		}
	}
	
	this.closeAll = closeAll;
	
	function closeNode(el){		
		var node = d3.select(el)
			, nodeData = node.datum()
			, idx = 0
			;
		
		/*var title = d3.select('.graph-title');
			title.attr('class', 'graph-title')
			;*
			
		title.select('.caption')
			.text('Global graph')
			.select('small')
			.text('')
			;*/
		
		closeCard(node, nodeData);
		if(!_.isNull(nodeLink))
			toggleLinkMode(el);
		
		/*
		Knoten zurück verschieben, die sich um dieses Element befinden
		*/
		link.selectAll('path').transition()
			.duration(transitionCard)
			.ease('elastic')
			.attrTween('d', function(d){			
				var sx = [d.source.x, d.source.x]
					, sy = [d.source.y, d.source.y]
					, tx = [d.target.x, d.target.x]
					, ty = [d.target.y, d.target.y]
					;
				
				if(!_.isUndefined(d.source.tx))
					sx[0] = d.source.tx;
				if(!_.isUndefined(d.source.ty))
					sy[0] = d.source.ty;
					
				if(!_.isUndefined(d.target.tx))
					tx[0] = d.target.tx;
				if(!_.isUndefined(d.target.ty))
					ty[0] = d.target.ty;
										
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
			});
		
		label
			.transition()
			.ease('elastic')
			.duration(transitionCard)
			.attrTween('transform', function(d, i, a){
				var x = [d.x, d.x]
					, y = [d.y, d.y]
					, p = [getScalingFactor(d), getScalingFactor(d)]
					;
				
				if(!_.isUndefined(d.tx)){
					x[0] = d.tx;
					delete d.tx;
				}
				if(!_.isUndefined(d.ty)){
					y[0] = d.ty;
					delete d.ty;
				}
								
				return function(t){
					var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ') scale(' + ((p[0] * (1 - t) + p[1] * t) / 2 + 0.75) + ')';
					return ret;
				}
			})
		
		currentNode = null;
	}
	
	this.closeNode = closeNode;
	
	function selectNode(el, transitionTime){
		var node = d3.select(el)
		, nodeData = node.datum()
		;
		
		if(!_.isNull(currentNode)){
			if(currentNode.data.id == nodeData.id)
				return false;
		}
		
		if(!_.isNull(nodeLink)){
			store.dispatch(actions.toRelation(nodeLink.id, nodeData.id));
			return false;
		}
		
		openNode(el, node, nodeData, transitionTime);
	}
	
	this.selectNode = selectNode;
	
	/*
	Open a node in the sidebar	
	*/
	function openNode(el, node, nodeData, transitionTime){
		if(!_.isNull(d3cola))
			d3cola.stop();
		
		var idx = 0
			, color = '#FFFFFF' //colors3[typeColors[nodeData.type]] //?'#0288D1':'#8BC34A'
			, color2 = colors[typeColors[nodeData.type]] //?'#0288D1':'#8BC34A'
			;
				
		removeSelection();
			
		//console.log('opening node ' + nodeData.id);						
		svg.attr('class', svg.attr('class') + ' node-selected selected-' + nodeData.type);
		node.attr('class', node.attr('class') + ' selected');
		
		currentNode = {
			el: el,
			node: node,
			data: nodeData
		};
		
		showCard(node, nodeData);

		//highlight neighbours
		var neighbours = {};
		
		var linksToNeighbours = link.filter(function(d){
			if(d.source.id == nodeData.id){
				neighbours[d.target.id] = true;
				return true;
			}
			if(d.target.id == nodeData.id){
				neighbours[d.source.id] = true;
				return true;
			}
			
			return false;
		});
		
		linksToNeighbours.each(function(d){
			var l = d3.select(this);
			l.attr('class', l.attr('class') + ' selection-neighbour');
		});
		
		label.each(function(d){
			if(!_.isUndefined(neighbours[d.id])){
				var n = d3.select(this);
				n.attr('class', n.attr('class') + ' selection-neighbour');
			}
		});
		
		/*
		Platz um das Element herum schaffen	
		*/		
		var newPosition = {
			x: nodeData.x, //Math.min(Math.max(nodeData.x, oWidth / 2), width - oWidth / 2),
			y: nodeData.y //Math.min(Math.max(nodeData.x, oHeight / 2), width - oHeight / 2)
		};
		
		//Zielgroesse ermitteln
		var dim = {
			x: [newPosition.x - oWidth / 2, newPosition.x + oWidth / 2],
			y: [newPosition.y - oHeight / 2, newPosition.y + oHeight / 2]
		};
				
		if(dim.x[0] < 0)
			newPosition.x += dim.x[0] * -1;
		if(dim.y[0] < 0)
			newPosition.y += dim.y[0] * -1;
		if(dim.x[1] > width)
			newPosition.x += width - dim.x[1];
		if(dim.y[1] > height)
			newPosition.y += height - dim.y[1];
		
		dim = {
			x: [newPosition.x - oWidth / 2, newPosition.x + oWidth / 2],
			y: [newPosition.y - oHeight / 2, newPosition.y + oHeight / 2]
		};
		
		var minDelta = null;
		
		//geringsten Abstand ermitteln
		label.each(function(d){
			if(d.id != nodeData.id){				
				var deltaX = newPosition.x - d.x
					, deltaY = newPosition.y - d.y
					, delta = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2))
					;
					
				if(_.isNull(minDelta) || delta < minDelta)
					minDelta = delta;
			}
		});
		
		var r = Math.sqrt(Math.pow(oHeight / 2, 2) + Math.pow(oHeight / 2, 2)) - minDelta;
				
		/*
		Knoten verschieben, die sich um dieses Element befinden
		*/
		label
			.transition()
			.ease('elastic')
			.duration(_.isUndefined(transitionTime)?transitionCard:transitionTime)
			.attrTween('transform', function(d, i, a){
				var x = [d.x, d.x]
					, y = [d.y, d.y]
					, p = [getScalingFactor(d), getScalingFactor(d)]
					;
									
				if(d.id == nodeData.id){
					x[1] = newPosition.x;
					y[1] = newPosition.y;
				}else{			
					//Abstand vom alten Zentrum
					var deltaX = nodeData.x - d.x
						, deltaY = nodeData.y - d.y
						, delta = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2))
						, f = 1 / Math.pow(1 + 1 / 600 * Math.min(Math.abs(delta - r), 600), 2)
						, newDelta = delta + r * f
						, tDeltaX = 0
						, tDeltaY = 0
						;
					
					
								
					if(deltaX != 0){					
						//tDeltaX = newDelta / Math.pow(Math.pow(deltaX, 2) + Math.pow(deltaY, 2), 0.5)
						tDeltaX = newDelta / Math.sqrt(Math.pow(deltaY / deltaX, 2) + 1)
						, tDeltaY = tDeltaX * deltaY / deltaX
						;
						if(deltaX >= 0){
							tDeltaX *= -1;
							tDeltaY *= -1;
						}
					}
					else{
						tDeltaY = newDelta
						, tDeltaX = 0
						;
						
						if(deltaY >= 0){
							tDeltaX *= -1;
							tDeltaY *= -1;
						}
					}
					
					var newX = nodeData.x + tDeltaX
						, newY = nodeData.y + tDeltaY
						;
					
					x[1] = newX;
					y[1] = newY;
				}
				
				d.tx = x[1];
				d.ty = y[1];
								
				return function(t){
					var ret = 'translate(' + Math.round(x[0] * (1 - t) + x[1] * t) + ',' + Math.round(y[0] * (1 - t) + y[1] * t) + ') scale(' + ((p[0] * (1 - t) + p[1] * t) / 2 + 0.75) + ')';
					return ret;
				}
			})
			
		link.selectAll('path').transition()
			.duration(_.isUndefined(transitionTime)?transitionCard:transitionTime)
			.ease('elastic')
			.attrTween('d', function(d){			
				var sx = [d.source.x, d.source.tx]
					, sy = [d.source.y, d.source.ty]
					, tx = [d.target.x, d.target.tx]
					, ty = [d.target.y, d.target.ty]
					;
																
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
			});
	}
	
	function toRelation(entity1, entity2, callback){
		//ToDo: Animation
		setTimeout(callback, 0);
	}
	
	this.toRelation = toRelation;
	
	function removeSelection(){
		svg.attr('class', svg.attr('class').replace(/^selected(\-[^\s]+)?/g, '').replace(/\sselected(\-[^\s]+)?/g, '').replace(/^node\-selected(\-[^\s]+)?/g, '').replace(/\snode\-selected(\-[^\s]+)?/g, ''));
		
		link.attr('class', function(d){
			return d3.select(this).attr('class').replace(' selected', '').replace(' selection-neighbour', '');
		});
		
		label.attr('class', function(d){
			return d3.select(this).attr('class').replace(' selected', '').replace(' highlighted', '').replace(' selection-neighbour', '');
		});
	}
		
	this.openNode = openNode;
	
	function addNode(nodeData, callback){		
		setData();
		gG.addData(nodeData);
		gG.rankNodes();
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
				
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				},
				function(){
					selectNode('.label[data-id="' + nodeData.nodes[0].id + '"]');
				}
			], function(){
				d3cola.on('tick', tick);
				d3cola.resume();
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	this.addNode = addNode;
		
	function setData(){
		var attributes = {
			id: true,
			x: true,
			y: true,
			width: true,
			height: true,
			pageRank: true,
			focused: true
		};
		
		if(arguments.length > 0)
			attributes = _.defaults(arguments[0], attributes);
		
		if(!_.isNull(d3cola))
			d3cola.stop();
			
		var classes = document.querySelector(svgSelector).classList;
		for(var i = classes.length - 1; i >= 0; i--)
			if(classes.item(i) == 'node-selected' || classes.item(i).substr(0,9) == 'selected-')
				classes.remove(classes.item(i));
		
		closeAll();
		
		if(!_.isEmpty(renderNodes))
			gG.setCurrentValues(renderNodes.map(function(n){
				var ret = {};
				for(var key in attributes){
					if(attributes[key])
						ret[key] = n[key];
				}
				
				return ret;
			}));
	}
	
	function toGlobal(callback){
		gG.hideTemporarily();
		
		setData({
			focused: false,
			tfidf: false
		});
		gG.rankNodes();
		gG.buildRenderGraph(maxFocus, maxNeighbours, false);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
					delete n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				}
			], function(){
				//console.log('Done unfocus graph transition');
									
				d3cola.on('tick', tick);
				d3cola.resume();	
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	this.toGlobal = toGlobal;
	
	function focus(graph, callback){
		gG.hideTemporarily();
		
		setData();
		gG.setData(graph, true);
		gG.rankNodes(null, null, graph);
		gG.buildRenderGraph(maxFocus, maxNeighbours, null);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				if(!_.isUndefined(n.focused))
						ret.focused = n.focused;
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				/*function(next){
					setTimeout(next, 5000);
				},*/
				removeDeleted,
				/*function(next){
					setTimeout(next, 5000);
				},	*/	
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting//,
						//showNew
					], done);
				},
				/*function(next){
					setTimeout(next, 5000);
				},*/
				showNew
			], function(){
				//console.log('Done focus graph transition');
									
				d3cola.on('tick', tick);
				d3cola.resume();	
		
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
		
	this.focus = focus;

	function updateRedux(callback){
		renderGraph = gG.get();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				}
			], function(){
				//console.log('Done graph transition');
									
				d3cola.on('tick', tick);
				d3cola.resume();
				
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
		
	function update(graph, callback){
		setData();
		gG.setData(graph);
		gG.rankNodes();
		gG.buildRenderGraph(maxFocus, maxNeighbours);
		renderGraph = gG.getRenderGraph();
		
		if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
			renderNodes = _.map(renderGraph.nodes, function(n){
				var ret = {};
				nodeAttr.forEach(function(attr){
					if(!_.isUndefined(n[attr]))
						ret[attr] = n[attr];
				});
				
				return ret;
			});
			
			d3cola = cola.d3adaptor()				
			elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
			
			async.series([
				removeDeleted,				
				calculateNewLayout,
				applyNewData,
				function(done){
					async.parallel([
						moveExisting,
						showNew
					], done);
				}
			], function(){
				//console.log('Done graph transition');
									
				d3cola.on('tick', tick);
				d3cola.resume();
				
				if(_.isFunction(callback))
					setTimeout(callback, 0);
			});
		}
	}
	
	this.update = update;
	
	function showNode(){
		q.push({
			context: this,
			callback: arguments[arguments.length - 1],
			args: arguments,
			f: (id, isTemporarily, callback) => {
				setData();
				//console.log('Showing node ' + id);
				gG.rankNodes();
				gG.show(id, isTemporarily);
				gG.buildRenderGraph(maxFocus, maxNeighbours, null);
				renderGraph = gG.getRenderGraph();
				
				if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
					renderNodes = _.map(renderGraph.nodes, function(n){
						var ret = {};
						nodeAttr.forEach(function(attr){
							if(!_.isUndefined(n[attr]))
								ret[attr] = n[attr];
						});
						
						if(!_.isUndefined(n.focused))
								ret.focused = n.focused;
						
						return ret;
					});
					
					d3cola = cola.d3adaptor()				
					elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
					elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
					
					async.series([
						removeDeleted,				
						calculateNewLayout,
						applyNewData,
						function(done){
							async.parallel([
								moveExisting,
								showNew
							], done);
						}
					], function(){
						d3cola.on('tick', tick);
						d3cola.resume();
						if(_.isFunction(callback))
							setTimeout(callback, 0);
					});
				}
			}
		});
	}
	
	this.showNode = showNode;
	
	function hideNode(){	
		q.push({
			context: this,
			args: arguments,
			f: (id, isTemporarily, callback) => {
				if(gG.datum(id).showTemporarily){				
					setData();
					
					//console.log('Hiding node ' + id);
					gG.rankNodes();
					gG.hide(id, isTemporarily);
					gG.buildRenderGraph(maxFocus, maxNeighbours, null);
					renderGraph = gG.getRenderGraph();
					
					if(!_.isNull(renderGraph.nodes) && renderGraph.nodes.length > 0){			
						renderNodes = _.map(renderGraph.nodes, function(n){
							var ret = {};
							nodeAttr.forEach(function(attr){
								if(!_.isUndefined(n[attr]))
									ret[attr] = n[attr];
							});
							
							if(!_.isUndefined(n.focused))
									ret.focused = n.focused;
							
							return ret;
						});
						
						d3cola = cola.d3adaptor()				
						elNew = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
						elExisting = { nodes: null, nodeIds: {}, labels: null, links: null, linkIds: {}};
						
						async.series([
							removeDeleted,
							calculateNewLayout,
							applyNewData,
							function(done){
								async.parallel([
									moveExisting,
									showNew
								], done);
							}
						], function(){
							d3cola.on('tick', tick);
							d3cola.resume();
					
							if(_.isFunction(callback))
								setTimeout(callback, 0);
						});
					}
				}else{
					setTimeout(callback, 0);
				}
			}
		});
	}
	
	this.hideNode = hideNode;
		
	function showDetailsForId(nodeId, callback){
		//var el = svg.select('.label[data-id="' + nodeId + '"]');
		selectNode('.label[data-id="' + nodeId + '"]');
		showDetails('.label[data-id="' + nodeId + '"]', callback);
	}
	
	this.showDetailsForId = showDetailsForId;
			
	function highlight(nodeId){
		var callback = null;
		if(arguments.length > 1)
			callback = arguments[arguments.length - 1];
				
		var el = svg.select('.label[data-id="' + nodeId + '"] > circle');
				
		if(!_.isNull(el[0][0])){
			el.attr('r', labelRadius * 1.5);
			if(callback != null){
				setTimeout(callback, 0);
			}
		}else {
			showNode(nodeId, true, () => {
				console.log('highlight');
				highlight(nodeId, callback);
			});
		}
	}
	
	this.highlight = highlight;
	
	function unhighlight(nodeId){
		var el = svg.select('.label[data-id="' + nodeId + '"] > circle');
		el.attr('r', labelRadius);
		
		/*hideNode(nodeId, true, () => {

		});*/
	}
	
	this.unhighlight = unhighlight;
}
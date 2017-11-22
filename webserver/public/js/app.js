var d3 = require('d3')
	, async = require('async')
	, siteId = 1
	, Vis = require('./vis.js')
	, base64 = require('base-64')
	, Delegate = require('dom-delegate')
	, tplSites = require('./templates/sites/sites.hbs')
	, tplRelations = require('./templates/relations/relations.hbs')
	, tplRelation = require('./templates/relations/relation.hbs')
	, tplGraphtitle = require('./templates/graph/title.hbs')
	, tplNodeCreate = require('./templates/nodes/create.hbs')
	, actions = require('./actions/StoryfinderActions.js')
	, serialize = require('form-serialize')
	, Search = require('./search.js')
	, _ = require('lodash')
	;

var CHROME_PLUGIN_ID = "pebdjeaapfkjiceloeecpoedbliefnap";

module.exports = function(store){
	var nodeDetails = document.body.querySelector('.node-details')
		, relationDetails = document.body.querySelector('.relation-details')
		, nodeCreate = document.body.querySelector('.node-create')
		, graphTitle = document.body.querySelector('#graph-title')
		, menu = document.querySelector('.websites')
		, siteList = menu.querySelector('.site-list')
		, sites = []
		, io = require('socket.io-client')()
		, userId = store.getState().config.get('user-id')
		, isActive = true
		, vis = new Vis(store)
		, search = new Search(store, vis)
		;
	
	store.subscribe(() => {
		var state = store.getState().storyfinder;
		search.clear();
		switch(state.get('state')){
			case 'graph-to-relation':
				vis.toRelation(state.get('entity1_id'), state.get('entity2_id'), () => {
					relationDetails.classList.add('active');
					store.dispatch(actions.showRelation(state.get('entity1_id'), state.get('entity2_id')));
				});
			break;
			case 'localgraph-to-relation':
				vis.toRelation(state.get('entity1_id'), state.get('entity2_id'), () => {
					relationDetails.classList.add('active');
					store.dispatch(actions.showRelation(state.get('entity1_id'), state.get('entity2_id')));
				});
			break;
			case 'groupgraph-to-relation':
				vis.toRelation(state.get('entity1_id'), state.get('entity2_id'), () => {
					relationDetails.classList.add('active');
					store.dispatch(actions.showRelation(state.get('entity1_id'), state.get('entity2_id')));
				});
			break;
			case 'relation':
				console.log(state.get('relation'));
				relationDetails.innerHTML = tplRelation(state.get('relation'));
			break;
			case 'relation-to-graph':
				relationDetails.classList.remove('active');
				store.dispatch(actions.showGraph());
			break;
			case 'graph':
				/*d3.select('svg').attr('class', '');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				vis.update();*/
			break;
			case 'entity':
			
			break;
			case 'localgraph-to-global':
				unfocusSites();
				graphTitle.classList.remove('site');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				vis.toGlobal(function(){
					d3.select('svg').attr('class', '');
					store.dispatch(actions.showGlobal());
				});
			break;
			case 'graph-to-global':
				unfocusSites();
				graphTitle.classList.remove('site');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				vis.toGlobal(function(){
					d3.select('svg').attr('class', '');
					store.dispatch(actions.showGlobal());
				});
			break;
			case 'localgraph-to-localgraph':
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Site/' + state.get('site_id'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showLocalgraph(graph.Site, graph.Article));
					});
				});
			break;
			case 'graph-to-localgraph':
				graphTitle.classList.add('site');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Site/' + state.get('site_id'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showLocalgraph(graph.Site, graph.Article));
					});
				});
			break;
			case 'localgraph':
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
			break;
			case 'graph-to-groupgraph':
				graphTitle.classList.add('group');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Group/' + state.get('site_ids').join(';'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showGroupgraph(graph.Sites, graph.Articles));
					});
				});
			break;
			case 'localgraph-to-groupgraph':
				graphTitle.classList.add('group');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Group/' + state.get('site_ids').join(';'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showGroupgraph(graph.Sites, graph.Articles));
					});
				});
			break;
			case 'groupgraph-to-groupgraph':
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Group/' + state.get('site_ids').join(';'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showGroupgraph(graph.sites, graph.articles));
					});
				});
			break;
			case 'groupgraph-to-localgraph':
				graphTitle.classList.remove('group');
				graphTitle.classList.add('site');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				
				d3.json('/Graphs/Site/' + state.get('site_id'), function (error, graph) {
					d3.select('svg').attr('class', 'grayscale');
					vis.focus(graph, function(){
						store.dispatch(actions.showLocalgraph(graph.Site, graph.Article));
					});
				});
			break;
			case 'groupgraph-to-global':
				unfocusSites();
				graphTitle.classList.remove('site');
				graphTitle.classList.remove('group');
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				vis.toGlobal(function(){
					d3.select('svg').attr('class', '');
					store.dispatch(actions.showGlobal());
				});
			break;
			case 'groupgraph':
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
				console.log(state.toJSON());
			break;
			case 'requesting-graph':
				graphTitle.innerHTML = tplGraphtitle(state.toJSON());
			break;
			case 'create':
				nodeCreate.classList.add('active');
				nodeCreate.innerHTML = tplNodeCreate(_.defaults(state.get('nodedata').toJS(), {
					article_id: state.getIn(['article', 'id'])
				}));
				nodeCreate.querySelector('input').focus();
			break;
			case 'create-to-graph':
				nodeCreate.classList.remove('active');
				store.dispatch(actions.showGlobal());
			break;
			case 'request-save-node':
				nodeCreate.querySelector('.btn-save').innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
			break;
			case 'receive-save-node':
				nodeCreate.classList.remove('active');
				vis.addNode(state.get('node').toJS(), function(){
					
				});
				store.dispatch(actions.showGlobal());
			break;
			case 'request-create-relation':
				relationDetails.querySelector('.new-relation').innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
			break;
			case 'receive-create-relation':
				relationDetails.classList.remove('active');
				vis.addNode({
					nodes: [],
					links: [
						state.getIn(['relation']).toJS()
					]
				}, function(){
					
				});
				store.dispatch(actions.showGraph());
			break;
			default:
				console.log('Unknown state: ' + state.get('state'));
			break;
		}
	})
	
	function unfocusSites(){
		for (var el of siteList.querySelectorAll('ul > li'))
			el.classList.remove('focused');
	}
	
	/*function nextSite(){
		d3.json('/' + userId + '/sites/' + siteId + '/graph', function (error, graph) {
			vis.update(graph, function(){

			});
		});
	}*/
	
	function focusSite(id){
		store.dispatch(actions.toLocalgraph(id));
	}
	
	function focusGroup(ids){
		store.dispatch(actions.toGroupgraph(ids));
	}
	
	function current(){
		d3.json('/Graphs', function (error, graph) {
			//sites = graph.sites;
			
			//ToDo: Seiten laden
			//redrawSitelist();
			
			vis.update(graph, function(){
				d3.select('svg').attr('class', '');
			});
		});
	}
	
	function showRelations(){
		var tabs = nodeDetails.querySelector('.tabs');
		tabs.querySelector('.selected').className = '';
		tabs.querySelector('[data-toggle="show-relations"]').className = 'selected';
		var nodeId = nodeDetails.getAttribute('data-id');
		
		var body = nodeDetails.querySelector('.content-body');
		body.innerHTML = '<i class="fa fa-spinner fa-spin fa-3x"></i>';
		
		d3.json('/Relations/Entity/' + nodeId, function(json){
			body.innerHTML = tplRelations(json);
		});
	}
	
	function showSources(){
		var tabs = nodeDetails.querySelector('.tabs');
		tabs.querySelector('.selected').className = '';
		tabs.querySelector('[data-toggle="show-sources"]').className = 'selected';
		var nodeId = nodeDetails.getAttribute('data-id');
		
		var body = nodeDetails.querySelector('.content-body');
		body.innerHTML = '<i class="fa fa-spinner fa-spin fa-3x"></i>';
		
		d3.json('/Entities/' + nodeId, function(json){
			json.Sites.forEach(function(site){
				if(_.isUndefined(site.Article.sentences))
					site.Article.sentences = [];
				
				site.sentencesMore = (site.Article.sentences.length > 3)?(site.Article.sentences.length - 3):false;
			});
			
			body.innerHTML = tplSites(json);
			
			//Scale elements equaly
			var prevY = null
				, sitesByY = {}
				;
			
			function rescale(y){
				var row = sitesByY[y];
				
				var max = 0;
				row.forEach(function(c){
					if(c.height > max)
						max = c.height;
				});
				
				row.forEach(function(c){
					var s = d3.select(c.el).select('.sentences');
					var h = s.node().getBoundingClientRect().height;
					s.style('max-height', h + ((max - c.height)) + 'px');
					s.style('min-height', h + ((max - c.height)) + 'px');
				});
			}
			
			d3.select(body).selectAll('.site').each(function(d){
				var rect = this.getBoundingClientRect();
				var y = rect.top;
				
				if(prevY != y && prevY != null){
					rescale(prevY);
					
					rect = this.getBoundingClientRect();
					y = rect.top;
				}
				
				if(_.isUndefined(sitesByY[y]))
					sitesByY[y] = [];
				
				sitesByY[y].push({
					el: this,
					height: rect.height
				});
				
				prevY = y;				
			});
			
			if(!_.isNull(prevY))
				rescale(prevY);
		});
	}
	
	/*document.querySelector('#btn').addEventListener('click', nextSite);
	document.querySelector('#btn-current').addEventListener('click', current);
	
	document.querySelector('#btn-focus').addEventListener('click', function(){
		d3.json('/1/sites/' + siteId + '/graph', function (error, graph) {
			d3.select('svg').attr('class', 'grayscale');
			siteId++;
			vis.focus(graph, function(){
				
			});
		});
	});
	
	document.querySelector('#btn-gray').addEventListener('click', function(){
		d3.select('svg').attr('class', 'grayscale');
	});*/
	
	var svgDelegate = new Delegate(document.querySelector('svg'));
	
	svgDelegate.on('mouseover', '.close-card', function(event){	
		this.classList.add('hover');
	});
	
	svgDelegate.on('mouseover', '.close-card', function(event){	
		this.classList.remove('hover');
	});
	
	svgDelegate.on('click', '.close-card', function(event){	
		vis.closeNode(this.parentNode.parentNode, function(){
			
		});
		return false;
	});
	
	svgDelegate.on('click', '.actions-more', function(event){
		vis.showDetails(this.parentNode.parentNode.parentNode, function(el, data){		
			showSources();
		});
		return false;
	});
	
	svgDelegate.on('click', '.actions-expand', function(event){
		//store.dispatch(actions.expandNode(d3.select(this.parentNode.parentNode).datum().id));
		vis.toggleNode(this.parentNode.parentNode.parentNode, function(){
			
		});
		return false;
	});
	
	svgDelegate.on('click', '.actions-link', function(event){
		vis.toggleLinkMode(this.parentNode.parentNode.parentNode);
		/*vis.toggleNode(this.parentNode.parentNode.parentNode, function(){
			
		});*/
		return false;
	});
	
	svgDelegate.on('click', '.delete', function(event){
		if(confirm('Sure?')){
			vis.deleteNode(this.parentNode.parentNode.parentNode, function(){
				
			});
		}
		return false;
	});
	
	svgDelegate.on('click', '.add-target', function(event){
		/*vis.addNode(
		{
			nodes: [{
				id: 90000 + Math.round(Math.random() * 10000),
				caption: 'New Item',
				type: 'OTH',
				show_always: true
			}],
			links: []
		});*/
		store.dispatch(actions.createNode({}));
		return false;
	});
	
	svgDelegate.on('click', '.label', function(event){
		vis.selectNode(this);
		return false;
	});
	
	svgDelegate.on('click', '.link > path', function(event){
		store.dispatch(actions.toRelation(this.parentNode.getAttribute('data-sourceId'), this.parentNode.getAttribute('data-targetId')));
		return false;
	});
	
	svgDelegate.on('click', '.background', function(event){
		vis.closeAll(function(){
			
		});
		return false;
	});
	
	var detailsDelegate = new Delegate(document.querySelector('.node-details'));
	detailsDelegate.on('click', '.btn-back', function(event){
		vis.hideDetails();
		return false;
	});
	
	detailsDelegate.on('click', '[data-toggle="show-relations"]', function(event){
		showRelations();
		return false;
	});
	
	detailsDelegate.on('click', '[data-toggle="show-sources"]', function(event){
		showSources();
		return false;
	});
	
	detailsDelegate.on('click', '.relation', function(event){
		store.dispatch(actions.toRelation(this.parentNode.parentNode.parentNode.parentNode.getAttribute('data-id'), this.getAttribute('data-id')));
	});
	
	detailsDelegate.on('click', '.sentences-more', function(event){
		this.parentNode.classList.toggle('showOverflow');
		this.blur();
		return false;
	});
	
	var rdetailsDelegate = new Delegate(document.querySelector('.relation-details'));
	rdetailsDelegate.on('click', '.btn-back, .btn-cancel', function(event){
		store.dispatch(actions.toGraph());
		return false;
	});
	
	rdetailsDelegate.on('click', '.btn-create', function(event){
		store.dispatch(actions.createRelation(this.getAttribute('data-entity1'), this.getAttribute('data-entity2'), this.parentNode.parentNode.querySelector('input').value));
		return false;
	});
	
	rdetailsDelegate.on('keyup', 'li input', function(event){
		if(this.value.length > 0){
			this.parentNode.querySelector('.btn').classList.remove('disabled');
		}else{
			this.parentNode.querySelector('.btn').classList.add('disabled');
		}
		return false;
	});
	
	rdetailsDelegate.on('click', 'li .btn', function(event){
		var sentenceId = this.getAttribute('data-sentence-id')
			, entity1Id = this.getAttribute('data-entity1-id')
			, entity2Id = this.getAttribute('data-entity2-id')
			, label = this.parentNode.parentNode.querySelector('input').value
			;
			
		fetch('/Relations/' + entity1Id + '/' + entity2Id, {
			method: 'PUT',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				sentence_id: sentenceId,
				label: label
			}),
			credentials: 'same-origin'
		})
	    .then(function(response) {
	        if (response.status >= 400) {
	            throw new Error("Bad response from server");
	        }
	             
	        return response.json();
	    }).then(json => {
	        relationDetails.classList.remove('active');
			vis.addNode({
				nodes: [],
				links: [
					json.Relation
				]
			}, function(){
				
			});
			store.dispatch(actions.showGlobal());
		});
			
		return false;
	});
		
	var createNodeDelegate = new Delegate(nodeCreate);
	createNodeDelegate.on('click', '.btn-back', function(event){
		store.dispatch(actions.toGraph());
		return false;
	});
	
	createNodeDelegate.on('click', '.btn-save', function(event){
		var form = nodeCreate.querySelector('form');		
		var obj = serialize(form, { hash: true });

		store.dispatch(actions.saveNode(obj));
		return false;
	});
	
	var titleDelegate = new Delegate(graphTitle);
	titleDelegate.on('click', '.btn-back', function(event){
		store.dispatch(actions.toGlobal());
		return false;
	});
	
	titleDelegate.on('click', '.btn-menu', function(event){
		menu.classList.add('active');
		return false;
	});
	
	var menuDelegate = new Delegate(menu);
	
	menuDelegate.on('click', '.btn-open-site', function(event){
		window.open(this.getAttribute('href'));
		return false;
	});
	
	menuDelegate.on('click', '[data-toggle="focus-website"]', function(event){
		if(!event.metaKey){		
			unfocusSites();	
			menu.classList.remove('active');	
			this.classList.add('focused');
			var id = this.getAttribute('data-id');
			focusSite(id);
			return false;
		}else{
			//menu.classList.remove('active');	
			this.classList.add('focused');
			
			var ids = [];
			
			for (var el of siteList.querySelectorAll('ul > li.focused'))
				ids.push(el.getAttribute('data-id'));

			console.log('Focusing', ids);
			focusGroup(ids);
			
			return false;
		}
	});
	
	menuDelegate.on('click', '.btn-menu', function(event){
		menu.classList.remove('active');
		return false;
	});
	
	var relevantDelegate = new Delegate(document.querySelector('#site-not-relevant'));
	
	relevantDelegate.on('click', 'a[data-action="dismiss"]', function(event){
		document.querySelector('#site-not-relevant > .dialog-overlay').classList.remove('active');
		return false;
	});

	relevantDelegate.on('click', 'a[data-action="add"]', function(event){
		document.querySelector('#site-not-relevant > .dialog-overlay').classList.remove('active');
		var url = document.querySelector('#site-not-relevant a[data-action="add"]').getAttribute('data-url');
		
		//Send message to plugin
		if(typeof parent != null)
			parent.postMessage(["msg", {
				action: 'parseSite',
				url: url
			}], "*");
		
		return false;
	});
		
	/*document.querySelector('#btn-save').addEventListener('click', function(){
		encode_as_img_and_link();
	});*/
	
	function encode_as_img_and_link(){
		//get svg element.
		var svg = document.querySelector("svg");
		var style = document.querySelector('style').innerHTML;
		
		d3.select(svg).append('style').attr({type: 'text/css', media: 'screen'})
	       .text(style);
		
		//get svg source.
		var serializer = new XMLSerializer();
		var source = serializer.serializeToString(svg);
		
		//add name spaces.
		if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
		    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
		}
		if(!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)){
		    source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
		}
		
		//add xml declaration
		source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
		
		//convert svg source to URI data scheme.
		var url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
		
		//set url value to a element's href attribute.
		window.open(url);
		//you can download svg file by right click menu.
	}
	
	function loadSites(page){
		fetch('/Sites', {
			credentials: 'same-origin'
		})
	    .then((response) => {
	        if (response.status >= 400) {
	            throw new Error("Bad response from server");
	        }
	            
	        return response.json();
	    }).then(json => {
			  console.log(json.sites);
			sites = json.Sites;
			redrawSitelist();
		});
	}
	
	function redrawSitelist(){
		var html = [];
		var currentSite = null;
		if(sites.length > 0)
			sites.forEach(function(site){
				if(_.isNull(site) || _.isUndefined(site.url) || _.isNull(site.url) || site.url.length == 0)return;
				
				var isNew = false;
				if(currentSite != site.host){
					currentSite = site.host;
					isNew = true;
				}
				
				var shortUrl = site.url.substr(site.host.length);
				var shortHost = site.host.replace(/^http(s)?\:\/\//,'').replace(/^www\./,'');
				
				shortUrl = shortUrl.replace(/^\//,'');
				
				if(!_.isUndefined(site.title) && !_.isNull(site.title) && site.title.length > 0)
					shortUrl = site.title;
					
				if(shortUrl.length == 0)
					shortUrl = site.url;
				
				html.push('<li class="' + (isNew?'new-site':'') + '" data-id="' + site.id + '" data-toggle="focus-website">' + (_.isNull(site.favicon)?('<div class="favicon-placeholder">' + shortHost.substr(0, 1) + '</div>'):'<img class="favicon" src="' + site.favicon + '" />') + '<div class="host">' + shortHost + '</div><div class="url">' + shortUrl + '</div><a class="btn-open-site" href="' + site.url + '" target="blank"><i class="material-icons">launch</i></a></li>');
			});
		
		document.querySelector('.websites > .site-list > ul').innerHTML = html.join('');
	}
	
	function showSiteNotRelevant(data){
		document.querySelector('#site-not-relevant a[data-action="add"]').setAttribute('data-url', data.url);
		document.querySelector('#site-not-relevant > .dialog-overlay').classList.add('active');
	}
	
	function hideSiteNotRelevant(data){
		document.querySelector('#site-not-relevant > .dialog-overlay').classList.remove('active');
	}
	
	function activate(){
		isActive = true;
	}
	
	function deactivate(){
		isActive = false;
	}
	
	var _handleResize = _.debounce(function(){
		vis.handleResize();
	}, 300);
	
	current();
	loadSites();
		
	io.on('new_site', function(site){
		if(!isActive)return false;
		//alert('Received site');
		search.clear();
		if(site.is_relevant || !site.is_new){
			hideSiteNotRelevant();
			sites.push(site.Site);
			redrawSitelist();
			siteList.querySelector('[data-id="' + site.Site.id + '"]').classList.add('focused');
			store.dispatch(actions.toLocalgraph(site.Site.id));
		}else{
			graphTitle.innerHTML = tplGraphtitle(store.getState().storyfinder.toJSON());
		}
	});
	
	io.on('parsing_site', function(site){
		if(!isActive)return false;
		search.clear();
		graphTitle.innerHTML = tplGraphtitle({loading: true});
	});
	
	io.on('done_parsing_site', function(site){
		if(!isActive)return false;
		graphTitle.innerHTML = tplGraphtitle(store.getState().storyfinder.toJSON());
	});
	
	io.on('new_entity', function(data){
		if(!isActive)return false;
		search.clear();
		
		if(typeof parent != 'undefined' && parent != null){
			parent.postMessage(["msg", {
				action: 'newEntity',
				data: data
			}], "*");
		}
	});
	
	/*
	Plugin Events	
	*/
	
	document.querySelector('.btn-photo').addEventListener('click', () => {
		encode_as_img_and_link();
	});
	
	window.addEventListener("message", receiveMessage, false);

	window.addEventListener("resize", _handleResize);

	function receiveMessage(event)
	{
		var origin = event.origin || event.originalEvent.origin; // For Chrome, the origin property is in the event.originalEvent object.

        // show the event for debugging purposes
        // TODO: deleteme
        console.log(event);

        if (origin !== "chrome-extension://"+CHROME_PLUGIN_ID) {
            console.log('Origin mismatch:', origin);
            return;
        }
						
		switch(event.data.action){
			case 'open':
				vis.showDetailsForId(event.data.data, function(el, data){		
					showSources();
				});
			break;
			case 'create':
				store.dispatch(actions.createNode(event.data.data));
			break;
			case 'highlight':
				vis.highlight(event.data.data);
			break;
			case 'unhighlight':
				vis.unhighlight(event.data.data);
			break;
			case 'not-relevant':
				showSiteNotRelevant(event.data.data);
			break;
			case 'activate':
				activate();
			break;
			case 'deactivate':
				deactivate();
			break;
			default:
				alert('Unknown event action: ' + event.data.action);
			break;
		}
	}
	
	//store.dispatch(actions.initializeGlobal());
}
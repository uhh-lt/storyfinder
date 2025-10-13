var _ = require('lodash')
	, async = require('async')
	, Delegate = require('dom-delegate')
	, tplResults = require('./templates/search/results.hbs')
	, actions = require('./actions/StoryfinderActions.js')
	;

module.exports = function(store, vis){
	var inputDelegate = null
		, searchDelegate = null
		, searchQ = async.queue(search, 1)
		, elResults = document.getElementById('search-results')
		;
	
	function initialize(){
		inputDelegate = new Delegate(document.body.querySelector('#graph-title'));
		
		inputDelegate.on('keyup', '.btn-search > input', function(event){
			var value = event.target.value;
			
			if(value.replace(/\s+/g, '').length == 0){
				event.target.classList.remove('active');
				event.target.parentNode.classList.remove('active');
				elResults.classList.remove('active');
			}else{
				elResults.classList.add('active');
				event.target.classList.add('active');
				event.target.parentNode.classList.add('active');
				searchQ.push(value);
			}
		});
		
		inputDelegate.on('click', '.btn-search .icon-close', function(event){
			clear();
			return false;
		});
		
		searchDelegate = new Delegate(elResults);
		
		searchDelegate.on('click', '.site .show-graph', function(event){
			clear();
			store.dispatch(actions.toLocalgraph(event.target.getAttribute('data-id')));
			return false;
		});
		
		searchDelegate.on('click', '.entity', function(event){
			clear();
			vis.highlight(parseInt(event.target.getAttribute('data-id')), () => {
				vis.selectNode('.label[data-id="' + parseInt(event.target.getAttribute('data-id')) + '"]');
			});
			return false;
		});
	}
	
	function clear(){
		var input = document.body.querySelector('#graph-title .btn-search > input');
		if(input != null){
			input.value = '';
			input.blur();
			input.classList.remove('active');
			input.parentNode.classList.remove('active');
		}
		if(elResults != null)
			elResults.classList.remove('active');
	}
	
	function search(searchValue, callback){
		if(searchQ.length() > 0)
			return setTimeout(callback, 0); //Process only the latest query
			
		fetch('/Entities/search?q=' + encodeURIComponent(searchValue), {
			credentials: 'same-origin'
		})
		.then(response => response.json())
		.then(json => {
			showResults(json);
			setTimeout(callback, 0);
		}).catch(err => {
			console.log(err);
			setTimeout(callback, 0);	
		});
	}
	
	function showResults(results){
		results.Sites.forEach(function(site){
			if(_.isUndefined(site.Article.Sentences))
				site.Article.Sentences = [];
			
			site.Article.Sentences = _.map(site.Article.Sentences, (sentence) => {
				return sentence.text.split(results.search).join('<strong>' + results.search + '</strong>');
			});
						
			site.sentencesMore = (site.Article.Sentences.length > 3)?(site.Article.Sentences.length - 3):false;
		});
		
		elResults.innerHTML = tplResults(results);
				
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
				var s = c.el.querySelector('.sentences');
				if(s == null)return;
				var h = s.getBoundingClientRect().height;
				s.style.maxHeight = h + ((max - c.height)) + 'px';
				s.style.minHeight = h + ((max - c.height)) + 'px';
			});
		}
		
		var sites = document.body.querySelectorAll('.site');
		
		for(var site of sites){
			var rect = site.getBoundingClientRect();
			var y = rect.top;
			
			if(prevY != y && prevY != null){
				rescale(prevY);
				
				rect = site.getBoundingClientRect();
				y = rect.top;
			}
			
			if(_.isUndefined(sitesByY[y]))
				sitesByY[y] = [];
			
			sitesByY[y].push({
				el: site,
				height: rect.height
			});
			
			prevY = y;				
		}
		
		if(!_.isNull(prevY))
			rescale(prevY);
	}
	
	this.clear = clear;
	
	initialize();
}
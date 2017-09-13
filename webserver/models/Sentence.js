var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	, escapeStringRegexp = require('escape-string-regexp')
	;
	
module.exports = function(db){
	//console.log('Sentence');
	var name = 'Sentence'
		, models = _.defaults({Sentence: this}, arguments[1] || {})
		, table = 'sentences'
		, datasource = new DatasourceMysql(db, name, table)
		, Article = models['Article'] || (new (require('./Article.js'))(db, models))
		;

	function findWithEntity(/*entityId,[ options,] callback*/){
		var entity = arguments[0]
			, options = {
				articles: null, //Scope
			}
			, callback = arguments[arguments.length - 1]
			, conditions = {
				is_deleted: 0
			}
			;
		
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
		
		if(!_.isEmpty(options.articles))
			conditions.article_id = options.articles;
	
		datasource.find('all', {
			fields: ['id', 'text', 'article_id'],
			conditions: conditions,
			order: 'id'
		}, (err, candidates) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(candidates))return setImmediate(() => callback(null, []));
			
			_mHighlight({sentences: candidates, options: {highlight: [entity]}}, (err, memo) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, memo.sentences));
			});
			/*
			var values = [(!_.isUndefined(entity.multiword) && !_.isNull(entity.multiword))?entity.multiword:entity.value];
			
			if(!_.isUndefined(entity.merged))
				entity.merged.forEach((n) => values.push((!_.isUndefined(n.multiword) && !_.isNull(n.multiword))?n.multiword:n.value));
				
			var sentences = [];
			async.eachSeries(candidates, function(sentence, nextSentence){
				var html = sentence.text;
				var containsToken = false;
				
				values.forEach(function(v){
					var vescaped = escapeStringRegexp(v);
					var regs = [
						new RegExp('(\\\s' + vescaped + '\\\s)', 'g'),
						new RegExp('^(' + vescaped + '\\\s)', 'g'),
						new RegExp('(\\\s' + vescaped + ')$', 'g'),
						new RegExp('^(' + vescaped + ')$', 'g')
					];
					
					regs.forEach(function(re){
						if(sentence.text.search(re) != -1){
							html = html.replace(re, "<strong>$1</strong>");
							containsToken = true;
						}
					});
				});
				
				if(containsToken)								
					sentences.push(_.defaults(sentence, {
						id: sentence.id,
						html: html
					}));

				setImmediate(nextSentence);
			}, function(err){
				setImmediate(() => callback(null, sentences));
			});*/
		});
	}
	
	this.findWithEntity = findWithEntity;
	
	function findWithText(/*text, oiptions, callback*/){
		var text = arguments[0]
			, options = {
				articles: null, //Scope
			}
			, callback = arguments[arguments.length - 1]
			, conditions = {
				'text LIKE': '%' + text + '%',
				is_deleted: 0
			}
			;
		
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
		
		if(!_.isEmpty(options.articles))
			conditions.article_id = options.articles;
	
		datasource.find('all', {
			fields: ['id', 'text', 'article_id'],
			conditions: conditions,
			order: 'id'
		}, (err, candidates) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(candidates))return setImmediate(() => callback(null, []));
			
			setImmediate(() => callback(null, candidates));
			
			/*_mHighlight({sentences: candidates, options: {highlight: [entity]}}, (err, memo) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, memo.sentences));
			});*/
		});
	}
	
	this.findWithText = findWithText;
	
	function findById(/*sentenceIds,[ options,]callback*/){
		var sentenceIds = arguments[0]
			, options = {
				withArticles: false, //Include articles in result
				highlight: null //Highlight entities
			}
			, callback = arguments[arguments.length - 1]
			;
		
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
			
		datasource.find('all', {
			fields: ['id', 'text', 'article_id'],
			conditions: {
				id: sentenceIds,
				is_deleted: 0
			},
			order: 'id'
		}, (err, sentences) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(sentences))return setImmediate(() => callback(null, []));

			async.waterfall([
				(next) => setImmediate(() => next(null, {options: options, sentences: sentences})),
				_mFindArticles,
				_mHighlight 
			], (err, memo) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, memo.sentences));
			});
		});
	}
	
	this.findById = findById;
	
	function _mFindArticles(memo, next){		
		if(!memo.options.withArticles)return setImmediate(() => next(null, memo));
		
		var idMap = {};
		memo.sentences.forEach((sentence, i) => (idMap[sentence.article_id] || (idMap[sentence.article_id] = [])).push(i));
		
		Article.findById(_.keys(idMap), {
			withSites: true
		}, (err, articles) => {
			if(err)return setImmediate(() => next(err));
			
			articles.forEach(article => {
				idMap[article.id].forEach(i => memo.sentences[i].Article = article);
			});
			next(null, memo);
		});
	}
	
	function _mHighlight(memo, next){
		if(_.isEmpty(memo.options.highlight))return setImmediate(() => next(null, memo));
		
		async.eachSeries(memo.options.highlight, (entity, nextEntity) => {
			var values = [(!_.isUndefined(entity.multiword) && !_.isNull(entity.multiword))?entity.multiword:entity.value];

			if(!_.isUndefined(entity.merged))
				entity.merged.forEach((n) => values.push((!_.isUndefined(n.multiword) && !_.isNull(n.multiword))?n.multiword:n.value));

			async.eachSeries(memo.sentences, function(sentence, nextSentence){
				var html = sentence.html || sentence.text;
				var containsToken = false;
				
				values.forEach(function(v){
					var vescaped = escapeStringRegexp(v);
					var regs = [
						new RegExp('(\\\s' + vescaped + '\\\s)', 'g'),
						new RegExp('^(' + vescaped + '\\\s)', 'g'),
						new RegExp('(\\\s' + vescaped + ')$', 'g'),
						new RegExp('^(' + vescaped + ')$', 'g')
					];
					
					regs.forEach(function(re){
						if(sentence.text.search(re) != -1){
							html = html.replace(re, "<strong class=\"entity type-" + entity.type + "\">$1</strong>");
							containsToken = true;
						}
					});
				});
				
				if(containsToken)
					sentence.html = html;

				setImmediate(nextSentence);
			}, nextEntity);					
		}, (err) => {
			/*
			Filter sentences without entity	
			*/
			memo.sentences = _.filter(memo.sentences, (sentence) => {
				return !_.isUndefined(sentence.html);
			});
			
			setImmediate(() => next(null, memo));
		});
	}
	
	function add(memo, next){
				
		async.eachOf(memo.data.sentences, (sentence, key, nextSentence) => {			
			datasource.insert(memo.changelog_id, {
				values: {
					article_id: memo.data.Article.id,
					text: sentence.text,
					is_deleted: 0
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => nextSentence(err));
				
				sentence.id = insertId;
				setImmediate(nextSentence);
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function findWithToken(articles, token, callback){
		datasource.find('all', {
			fields: ['id', 'text', 'article_id'],
			conditions: {
				article_id: articles,
				is_deleted: 0,
				'text LIKE': db.escape(token).replace(/^\'/,"%").replace(/\'$/,"%")
			}
		}, (err, candidates) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(candidates))return setImmediate(() => callback(null, []));
			
			_mHighlight({sentences: candidates, options: {highlight: [{value: token}]}}, (err, memo) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, memo.sentences));
			});
		});
	}
	
	this.findWithToken = findWithToken;
}
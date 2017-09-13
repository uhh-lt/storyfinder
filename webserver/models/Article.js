var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('Article');
	var name = 'Article'
		, models = _.defaults({Article: this}, arguments[1] || {})
		, table = 'articles'
		, datasource = new DatasourceMysql(db, name, table)
		, ArticleEntity = models['ArticleEntity'] || (new (require('./ArticleEntity.js'))(db, models))
		, Sentence = models['Sentence'] || (new (require('./Sentence.js'))(db, models))
		, Site = models['Site'] || (new (require('./Site.js'))(db, models))
		, Entity = models['Entity'] || (new (require('./Entity.js'))(db, models))
		, EntitySentence = models['EntitySentence'] || (new (require('./EntitySentence.js'))(db, models))
		, Relation = models['Relation'] || (new (require('./Relation.js'))(db, models))
		, RelationSentence = models['RelationSentence'] || (new (require('./RelationSentence.js'))(db, models))
		, Ngram = models['Ngram'] || (new (require('./Ngram.js'))(db, models))
		;
		
	function findById(/*id,[ options,]callback*/){
		var id = arguments[0]
			, options = {
				withSites: false
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
		
		datasource.find(_.isArray(id)?'all':'first', {
			fields: ['id', 'site_id', 'raw', 'text', 'excerpt', 'byline', 'title', 'created'],
			conditions: {
				id: id,
				is_deleted: 0
			}
		}, (err, articles) => {
			if(err)
				return setImmediate(() => callback(err));
			
			if(!options.withSites || _.isEmpty(articles))return setImmediate(() => callback(null, articles));
			
			var idMap = {};
			articles.forEach((article, i) => idMap[article.site_id] = i);
						
			Site.findById(_.keys(idMap), (err, sites) => {
				if(err)return setImmediate(() => callback(err));
				sites.forEach(site => articles[idMap[site.id]].Site = site);
				
				setImmediate(() => callback(null, articles));
			});
		});
	}
	
	this.findById = findById;
		
	function getLatest(siteId, callback){
		datasource.find(_.isArray(siteId)?'all':'first', {
			fields: ['id', 'site_id', 'raw', 'text', 'excerpt', 'byline', 'title', 'created'],
			conditions: {
				site_id: siteId,
				is_deleted: 0
			}
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, result));
		});
	}
	
	this.getLatest = getLatest;

	function findBySite(siteId, callback){
		datasource.find('first', {
			fields: ['id', 'site_id', 'text', 'created'],
			conditions: {
				site_id: siteId,
				is_deleted: 0
			},
			order: 'created DESC',
			group: 'site_id'
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, result));
		});
	}
	
	this.findBySite = findBySite;
	
	function findWithEntity(/*entity, [options, ], callback*/){
		var entity = arguments[0]
			, options = {
				withArticles: false, //Include articles
				withSentences: false //Include sentences
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
						
		ArticleEntity.findArticlesWithEntity(entity.id, (err, articlesWithEntity) => {
			if(err)return setImmediate(() => callback(err));
			
			if(articlesWithEntity.length == 0)return setImmediate(() => callback(null, []));
			
			datasource.find('all', {
				fields: ['id', 'site_id', 'created'],
				conditions: {
					id: _.keys(articlesWithEntity),
					is_deleted: 0
				},
				order: 'created DESC',
				group: 'site_id'
			}, (err, articles) => {
				if(err)return setImmediate(() => callback(err));
				if(_.isEmpty(articles))return setImmediate(() => callback(null, []));
								
				var idMap = {};
				_.forEach(articles,(article, key) => {
					article.count = articlesWithEntity.count
					idMap[article.id] = key;
				});
								
				if(!options.withSentences)return setImmediate(() => callback(null, articles));

				Sentence.findWithEntity(entity, {
					articles: _.keys(idMap)
				}, (err, sentences) => {
					if(err)return setImmediate(() => callback(err));
					if(_.isEmpty(sentences))return setImmediate(() => callback(null, articles));
					
					async.each(sentences, (sentence, nextSentence) => {
						(articles[idMap[sentence.article_id]].sentences || (articles[idMap[sentence.article_id]].sentences = [])).push(sentence);
						setImmediate(nextSentence);
					}, (err) => {
						if(err)return setImmediate(() => callback(err));
						
						setImmediate(() => callback(null, articles));
					});
				});
			});
		});
	}
	
	this.findWithEntity = findWithEntity;
	
	function add(data, callback){
		async.waterfall([
			(next) => setImmediate(() => next(null, data)),
			_mAdd,
			Entity.add,
			ArticleEntity.add,
			Sentence.add,
			EntitySentence.add,
			Relation.add,
			//RelationSentence.add,
			Ngram.add
		], callback);
	}
	
	this.add = add;
	
	function countDocumentsInCollection(collectionId, callback){
		datasource.find('all', {
			fields: ['count(*) `total`'],
			conditions: {
				collection_id: collectionId,
				is_deleted: 0
			},
			group: 'collection_id'
		}, (err, articles) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(articles))return setImmediate(() => callback(null, 0));
			setImmediate(() => callback(null, articles[0].total));
		});
	}
	
	this.countDocumentsInCollection = countDocumentsInCollection;
	
	
	function findWithToken(collectionId, token, callback){
		async.waterfall([
			(next) => setImmediate(() => next(null, {
				collection_id: collectionId,
				token: token
			})),
			(memo, next) => { //Find all articles in the collection
				datasource.find('list', {
					fields: ['id', 'site_id'],
					conditions: {
						collection_id: collectionId,
						is_deleted: 0
					}
				}, (err, articles) => {
					if(err)return setImmediate(() => callback(err));
					
					memo.articles = articles;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => { //Find all sentences containing the entity
				Sentence.findWithToken(_.keys(memo.articles), token, (err, sentences) => {
					if(err)return setImmediate(() => next(err));
					
					memo.sentences = sentences;
					
					memo.articles = sentences.reduce((articles, sentence) => {
						(articles[sentence.article_id] || (articles[sentence.article_id] = [])).push(sentence);
						return articles;
					}, {});
										
					setImmediate(() => next(null, memo));
				});
			}
		], (err, memo) => {
			if(err)return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, {
				Articles: memo.articles,
				Sentences: memo.sentences
			}));
		});
	}
	
	this.findWithToken = findWithToken;
	
	function search(/*value, collectionId, callback*/){
		var value = arguments[0]
			, collectionId = arguments[1]
			, callback = arguments[arguments.length - 1]
			;
		
		datasource.find('all', {
			fields: ['id', 'site_id', 'created'],
			conditions: {
				'text LIKE': '%' + value + '%',
				collection_id: collectionId,
				is_deleted: 0
			},
			order: 'created DESC',
			group: 'site_id',
			limit: 8
		}, (err, articles) => {
			if(err)return setImmediate(() => callback(err));
			
			Sentence.findWithText(value, {
				articles: _.map(articles, 'id')
			}, (err, sentences) => {
				if(err)return setImmediate(() => next(err));
				
				var sentencesByArticle = {};
				
				_.each(sentences, (sentence) => {
					(sentencesByArticle[sentence.article_id] || (sentencesByArticle[sentence.article_id] = [])).push(sentence);
				});
				
				for(var article of articles){
					article.Sentences = null;
					if(!_.isUndefined(sentencesByArticle[article.id])){
						article.Sentences = sentencesByArticle[article.id];
					}
				}
													
				setImmediate(() => callback(null, articles));
			});
		});
	}
	
	this.search = search;
	
	/*
		Memo functions	
	*/
		function _mAdd(memo, next){
			datasource.insert(memo.changelog_id, {
				values: {
					site_id: memo.data.Site.id,
					raw: memo.data.Article.content,
					text: memo.data.Article.plain,
					excerpt: memo.data.Article.excerpt,
					byline: memo.data.Article.byline,
					title: memo.data.Article.title,
					collection_id: memo.Collection.id,
					is_deleted: 0
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => next(err));
				
				memo.data.Article.id = insertId;
				memo.data.Article.site_id = memo.data.Site.id;
				
				setImmediate(() => next(null, memo));
			});
		}
}

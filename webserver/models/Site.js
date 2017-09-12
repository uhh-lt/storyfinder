var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	, cosDistance = require('compute-cosine-distance')
	;
	
module.exports = function(db){
	//console.log('Site');
	var name = 'Site'
		, models = _.defaults({Site: this}, arguments[1] || {})
		, table = 'sites'
		, datasource = new DatasourceMysql(db, name, table)
		, elementsPerPage = 50
		, Article = models['Article'] || (new (require('./Article.js'))(db, models))
		, Entity = models['Entity'] || (new (require('./Entity.js'))(db, models))
		;
		
	function getAll(collectionId, page, callback){
		datasource.find('all', {
			fields: ['id', 'url', 'host', 'title', 'favicon', 'last_visited'],
			conditions: {
				collection_id: collectionId,
				is_deleted: 0
			},
			order: ['created DESC', 'id DESC'],
			limit: [parseInt(page) * elementsPerPage, (parseInt(page) + 1) * elementsPerPage]
		}, (err, results) => {
			if(err)
				return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, results));
		});
	}
	
	this.getAll = getAll;
	
	function getById(id, collectionId, callback){		
		datasource.find(_.isArray(id)?'all':'first', {
			fields: ['id', 'url', 'host', 'title', 'favicon', 'collection_id', 'last_visited'],
			conditions: {
				id: id,
				collection_id: collectionId,
				is_deleted: 0
			}
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
						
			setImmediate(() => callback(null, result));
		});
	}
	
	this.getById = getById;
	
	function findById(id, callback){		
		datasource.find(_.isArray(id)?'all':'first', {
			fields: ['id', 'url', 'host', 'title', 'favicon', 'collection_id', 'created', 'last_visited', 'primary_color'],
			conditions: {
				id: id,
				is_deleted: 0
			},
			order: ['created DESC', 'id DESC']
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
						
			setImmediate(() => callback(null, result));
		});
	}
	
	this.findById = findById;
	
	/*
		Decide foreground color depending on background color	
	*/
	function _getDarkness(color){
		if(_.isNull(color))return 0;
		
		/*
		Quelle: http://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
		*/						
		var rgb = color.match(/.{1,2}/g);
			
		rgb = _.map(rgb, function(c){
			c = parseInt(c, 16);
			c = c / 255.0;
			c = (c <= 0.03928)?c/12.92:Math.pow((c+0.055)/1.055, 2.4);
			return c;
		});
		
		var l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

		return l;
	}
	
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
								
		Article.findWithEntity(entity, {withArticles: options.withArticles, withSentences: options.withSentences}, (err, articles) => {
			if(err)return setImmediate(() => callback(err));
			
			if(articles.length == 0)return setImmediate(() => callback(null, []));
						
			var idMap = {};
			_.forEach(articles, (article, i) => idMap[article.site_id] = i);
			
			datasource.find('all', {
				fields: ['id', 'url', 'host', 'title', 'favicon', 'last_visited', 'primary_color'],
				conditions: {
					id: _.keys(idMap),
					is_deleted: 0
				},
				order: 'last_visited DESC'
			}, (err, sites) => {
				if(err)return setImmediate(() => callback(err));
				if(_.isEmpty(sites))return setImmediate(() => callback(null, []));
				
				async.map(sites, function(site, nextSite){
					site.Article = articles[idMap[site.id]];
					site.shortUrl = site.url.substr(site.host.length);
					site.shortHost = site.host.replace(/^http(s)?\:\/\//,'').replace(/^www\./,'');
					site.isLight = (_getDarkness(site.primary_color) > 0.3)?true:false;
					
					nextSite(null, site);
				}, callback);
			});
		});
	}
	
	this.findWithEntity = findWithEntity;
	
	function findByUrl(/*url, collectionId, articleText,[ options,] callback*/){
		var url = arguments[0]
			, collectionId = arguments[1]
			, articleText = arguments[2]
			, options = {
				withArticle: false,
				withEntities: false,
				withRelations: false
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 4)
			options = _.defaults(arguments[4], options);
			
		datasource.find('first', {
			fields: ['id', 'url', 'host', 'title', 'favicon', 'last_visited', 'primary_color'],
			conditions: {
				url: url,
				collection_id: collectionId
			},
			order: 'created DESC'
		}, (err, site) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(site))return setImmediate(() => callback(null, null));
						
			async.waterfall([
				(next) => setImmediate(() => next(null, site)),
				(site, next) => {
					Article.findBySite(site.id, (err, article) => {
						if(err)return setImmediate(() => next(err));
						
						site.Article = article;
						setImmediate(() => next(null, site));
					});
				},
				(site, next) => { //Calculate cosine distance between the stored text and the new text
					var tokens1 = {}
						, tokens2 = {}
						;
					
					site.Article.text.split(/\s+/).map(function(token){
						if(tokens1[token])tokens1[token]++;
						else tokens1[token] = 1;
						
						tokens2[token] = 0;
					});
					
					articleText.split(/\s+/).map(function(token){
						if(tokens2[token])tokens2[token]++;
						else tokens2[token] = 1;
						
						if(_.isUndefined(tokens1[token]))tokens1[token] = 0;
					});
					
					var d = cosDistance(_.values(tokens1), _.values(tokens2));
					
					if(Math.abs(d) > 0.1)
						//If distance is too high => save as new site
						return setImmediate(() => callback(null, null));
					else
						return setImmediate(() => next(null, site));
				},
				(site, next) => {
					Entity.getInArticle(site.Article.id, (err, entities) => {
						if(err)return setImmediate(() => next(err));
						
						site.Entities = entities;
						setImmediate(() => next(null, site));
					});
				},
			], (err, site) => {
				if(err)return setImmediate(() => callback(err));
				setImmediate(() => callback(null, site));
			});
		});
	}
	
	this.findByUrl = findByUrl;
	
	function add(data, callback){
		async.waterfall([
			(next) => {
				datasource.startUpdate(data.user_id, (err, changelogId) => {
					if(err)return setImmediate(() => next(err));
					
					data.changelog_id = changelogId;
					setImmediate(() => next(null, data));
				});
			},
			_mAdd,
			Article.add
		], (err, memo) => {
			if(err)return setImmediate(() => callback(err));
			setImmediate(() => callback(null, {
				site_id: memo.data.Site.id,
				changelog_id: memo.changelog_id
			}));
		});
	}
	
	this.add = add;
	
	function setColor(siteId, color, userId, callback){		
		async.waterfall([
			(next) => {
				datasource.startUpdate(userId, (err, changelogId) => {
					if(err)return setImmediate(() => next(err));
					
					setImmediate(() => next(null, changelogId));
				});
			},
			(changelogId, next) => {
				datasource.update(changelogId, {
					values: {
						primary_color: color
					},
					conditions: {
						id: siteId
					},
					limit: 1
				}, next);
			}
		], (err, changelogId) => {
			if(err)return setImmediate(() => callback(err));
			setImmediate(() => callback(null, {
				changelog_id: changelogId
			}));
		});
	}
	
	this.setColor = setColor;
	
	function search(/*value, collectionId, callback*/){
		var value = arguments[0]
			, collectionId = arguments[1]
			, callback = arguments[arguments.length - 1]
			;
		
		Article.search(value, collectionId, (err, articles) => {
			if(err)
				return setImmediate(() => callback(err));
			
			var siteIds = {};
			_.each(articles, (article) => {
				siteIds[article.site_id] = article;
			});
			
			if(_.isEmpty(siteIds))
				return setImmediate(() => callback(null, []));
				
			findById(_.keys(siteIds), (err, sites) => {
				if(err)
					return setImmediate(() => callback(err));
				
				for(var site of sites){
					site.Article = siteIds[site.id];
				}
				
				setImmediate(() => callback(null, sites));
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
					url: memo.data.Site.url,
					hash: memo.data.Site.hash,
					host: memo.data.Site.host,
					title: memo.data.Site.headTitle,
					favicon: memo.data.Site.favicon,
					last_visited: datasource.now(),
					collection_id: memo.Collection.id,
					is_deleted: 0
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => next(err));
				
				memo.data.Site.id = insertId;
				setImmediate(() => next(null, memo));
			});
		}
}
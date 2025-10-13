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
            collection_id: collectionId,
            is_deleted: 0
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
                    // If no active article is found (e.g., previous soft-delete),
                    // treat as new site to force fresh ingest
                    if(_.isEmpty(article))
                        return setImmediate(() => callback(null, null));

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

	function softdeleteCascade(siteId, userId, callback){
		var DatasourceMysql = require('../datasources/mysql.js');
		var dsArticles = new DatasourceMysql(db, 'Article', 'articles');
		var dsSentences = new DatasourceMysql(db, 'Sentence', 'sentences');
		var dsAE = new DatasourceMysql(db, 'ArticleEntity', 'articles_entities');
		var dsES = new DatasourceMysql(db, 'EntitySentence', 'entities_sentences');
		var dsRS = new DatasourceMysql(db, 'RelationSentence', 'relations_sentences');
		var dsVisits = new DatasourceMysql(db, 'Visit', 'visits');
		var dsEntities = new DatasourceMysql(db, 'Entity', 'entities');
		var dsRelations = new DatasourceMysql(db, 'Relation', 'relations');
		var dsRelationtypes = new DatasourceMysql(db, 'Relationtype', 'relationtypes');

		async.waterfall([
			(next) => datasource.startUpdate(userId, next),
			(changelogId, next) => { // soft-delete site itself
				datasource.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { id: siteId },
					limit: 1
				}, (err) => next(err, changelogId));
			},
			(changelogId, next) => { // gather article ids for site
				dsArticles.find('list', {
					fields: ['id', 'id'],
					conditions: { site_id: siteId, is_deleted: 0 }
				}, (err, articleIds) => {
					if(err) return next(err);
					next(null, changelogId, _.keys(articleIds));
				});
			},
			(changelogId, articleIds, next) => { // soft-delete articles
				if(_.isEmpty(articleIds)) return next(null, changelogId, [], []);
				dsArticles.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { site_id: siteId }
				}, (err) => next(err, changelogId, articleIds));
			},
			(changelogId, articleIds, next) => { // gather sentence ids
				dsSentences.find('list', {
					fields: ['id', 'id'],
					conditions: { article_id: articleIds, is_deleted: 0 }
				}, (err, sentenceIds) => {
					if(err) return next(err);
					next(null, changelogId, articleIds, _.keys(sentenceIds));
				});
			},
			(changelogId, articleIds, sentenceIds, next) => { // soft-delete sentences
				if(_.isEmpty(sentenceIds)) return next(null, changelogId, articleIds, sentenceIds);
				dsSentences.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { id: sentenceIds }
				}, (err) => next(err, changelogId, articleIds, sentenceIds));
			},
			(changelogId, articleIds, sentenceIds, next) => { // soft-delete article-entity relations
				if(_.isEmpty(articleIds)) return next(null, changelogId, articleIds, sentenceIds);
				dsAE.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { article_id: articleIds }
				}, (err) => next(err, changelogId, articleIds, sentenceIds));
			},
			(changelogId, articleIds, sentenceIds, next) => { // soft-delete entity-sentence relations
				if(_.isEmpty(sentenceIds)) return next(null, changelogId, articleIds, sentenceIds);
				dsES.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { sentence_id: sentenceIds }
				}, (err) => next(err, changelogId, articleIds, sentenceIds));
			},
			(changelogId, articleIds, sentenceIds, next) => { // soft-delete relation-sentence relations
				if(_.isEmpty(sentenceIds)) return next(null, changelogId, articleIds, sentenceIds);
				dsRS.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { sentence_id: sentenceIds }
				}, (err) => {
					if(err) return next(err);
					// Additional cleanup: remove entities and relations with no remaining links
					async.series([
						// Entities that appear only in the deleted articles
						(cb) => {
							if(_.isEmpty(articleIds)) return cb();
							dsAE.find('list', {
								fields: ['entity_id', 'entity_id'],
								conditions: { article_id: articleIds }
							}, (e1, affectedEntities) => {
								if(e1) return cb(e1);
								var entityIds = _.keys(affectedEntities);
								if(_.isEmpty(entityIds)) return cb();
								dsAE.find('list', {
									fields: ['entity_id', 'count(*) `total`'],
									conditions: { entity_id: entityIds, is_deleted: 0 },
									group: 'entity_id'
								}, (e2, remaining) => {
									if(e2) return cb(e2);
									var toDelete = [];
									_.forOwn(affectedEntities, (v, id) => { if(_.isUndefined(remaining[id])) toDelete.push(parseInt(id)); });
									if(_.isEmpty(toDelete)) return cb();
									dsEntities.update(changelogId, {
										values: { is_deleted: 1 },
										conditions: { id: toDelete }
									}, cb);
								});
							});
						},
						// Relations that lost all supporting sentences due to this deletion
						(cb) => {
							dsRS.find('list', {
								fields: ['relation_id', 'relation_id'],
								conditions: { sentence_id: sentenceIds }
							}, (e3, affectedRelations) => {
								if(e3) return cb(e3);
								var relationIds = _.keys(affectedRelations);
								if(_.isEmpty(relationIds)) return cb();
								dsRS.find('list', {
									fields: ['relation_id', 'count(*) `total`'],
									conditions: { relation_id: relationIds, is_deleted: 0 },
									group: 'relation_id'
								}, (e4, remainingR) => {
									if(e4) return cb(e4);
									var toDeleteRel = [];
									_.forOwn(affectedRelations, (v, id) => { if(_.isUndefined(remainingR[id])) toDeleteRel.push(parseInt(id)); });
									if(_.isEmpty(toDeleteRel)) return cb();
									dsRelations.update(changelogId, {
										values: { is_deleted: 1 },
										conditions: { id: toDeleteRel }
									}, cb);
								});
							});
						}
					], (e) => next(e, changelogId));
				});
			},
			(changelogId, next) => { // soft-delete visits to site (optional)
				dsVisits.update(changelogId, {
					values: { is_deleted: 1 },
					conditions: { site_id: siteId }
				}, (err) => next(err, changelogId));
			},
			// Hard-delete legacy article tokens if present (no is_deleted column)
			(changelogId, next) => {
				// Collect article ids again for direct delete
				dsArticles.find('list', {
					fields: ['id', 'id'],
					conditions: { site_id: siteId }
				}, (err, articleIds) => {
					if(err) return next(err);
					var ids = _.keys(articleIds);
					if(_.isEmpty(ids)) return next(null, changelogId);
					var q = 'DELETE FROM `articles_tokens` WHERE `article_id` IN (' + ids.map(()=>'?').join(',') + ')';
					db.query(q, ids, (e) => next(e, changelogId));
				});
			},
			// Relationtypes without remaining relations -> soft-delete
			(changelogId, next) => {
				db.query('SELECT rt.id FROM relationtypes rt LEFT JOIN relations r ON (r.relationtype_id=rt.id AND r.is_deleted=0) WHERE rt.is_deleted=0 GROUP BY rt.id HAVING COUNT(r.id)=0', [], (err, rows) => {
					if(err) return next(err);
					if(_.isEmpty(rows)) return next(null, changelogId);
					var ids = rows.map(r=>r.id);
					dsRelationtypes.update(changelogId, {
						values: { is_deleted: 1 },
						conditions: { id: ids }
					}, (e) => next(e, changelogId));
				});
			}
		], (err, changelogId) => {
			if(err) return setImmediate(() => callback(err));
			setImmediate(() => callback(null, { changelog_id: changelogId, site_id: siteId }));
		});
	}

	this.softdeleteCascade = softdeleteCascade;
	
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
			if(err){
				console.log('Error in Site.js')
				return setImmediate(() => callback(err));
			}
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
			datasource.insertOrUpdate(memo.changelog_id, {
				values: {
					url: memo.data.Site.url,
					hash: memo.data.Site.hash,
					host: memo.data.Site.host,
					title: memo.data.Site.headTitle,
					favicon: memo.data.Site.favicon,
					last_visited: datasource.now(),
					collection_id: memo.Collection.id,
					is_deleted: 0
				},
				conditions: {
					url: memo.data.Site.url,
					hash: memo.data.Site.hash,
					collection_id: memo.Collection.id
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => next(err));
				memo.data.Site.id = insertId;
				setImmediate(() => next(null, memo));
			});
		}
}

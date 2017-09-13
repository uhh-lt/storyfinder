var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('ArticleEntity');
	var name = 'ArticleEntity'
		, table = 'articles_entities'
		, datasource = new DatasourceMysql(db, name, table)
		;
		
	function getCounts(entities, callback){
		datasource.find('list', {
			fields: ['entity_id', 'sum(count) `total`'],
			conditions: {
				entity_id: entities,
				is_deleted: 0
			},
			group: 'entity_id'
		}, callback);
	}
	
	this.getCounts = getCounts;
	
	function getInArticle(articleId, callback){
		datasource.find('list', {
			fields: ['entity_id', 'sum(count) `total`'],
			conditions: {
				article_id: articleId,
				is_deleted: 0
			},
			group: 'entity_id'
		}, callback);
	}
	
	this.getInArticle = getInArticle;
	
	function getDocumentfrequency(entityId, callback){
		datasource.find('list', {
			fields: ['entity_id', 'count(*) `df`'],
			conditions: {
				entity_id: entityId,
				is_deleted: 0
			},
			group: 'entity_id'
		}, callback);
	}
	
	this.getDocumentfrequency = getDocumentfrequency;
	
	function findArticlesWithEntity(entityId, callback){
		datasource.find('list', {
			fields: ['article_id', 'id', 'entity_id', 'count'],
			conditions: {
				entity_id: entityId,
				is_deleted: 0
			}
		}, callback);
	}
	
	this.findArticlesWithEntity = findArticlesWithEntity;
	
	function reassign(/*target, source, changelogId, callback*/){
		console.log('Reassign articleentity');
		var targetId = arguments[0]
			, sourceId = arguments[1]
			, changelogId = arguments[2]
			, callback = arguments[arguments.length - 1]
			;
			
		datasource.find('all', {
			fields: ['article_id', 'id', 'entity_id', 'count'],
			conditions: {
				entity_id: [targetId, sourceId],
				is_deleted: 0
			}
		}, (err, articles) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(articles))return setImmediate(() => callback(null, changelogId));
			
			var byId = {};
			
			byId[targetId] = {};
			byId[sourceId] = {};
			
			articles.forEach(article => {
				if(article.entity_id == sourceId)
					byId[sourceId][article.article_id] = article;
				else
					byId[targetId][article.article_id] = article;
			});
						
			async.forEachOf(byId[sourceId], (article, article_id, nextArticle) => {
				console.log(article_id);
				
				if(_.isUndefined(byId[targetId][article_id])){
					console.log('reassign');
					//Target is not connected with the article => move
					datasource.update(changelogId, {
						values: {
							entity_id: targetId
						},
						conditions: {
							id: article.id
						},
						limit: 1
					}, nextArticle);
				}else{
					console.log('update');
					//console.log(byId[targetId][article_id].id)
					//Target is already connected with the article => sum
					datasource.update(changelogId, { //Sum the count of the article relation of the target node
						values: {
							count: byId[targetId][article_id].count + article.count
						},
						conditions: {
							id: byId[targetId][article_id].id
						},
						limit: 1
					}, (err) => {
						if(err)return setImmediate(() => nextArticle(err));
						
						console.log('Done Article');
						
						datasource.update(changelogId, { //Delete the article relation of the source node
							values: {
								is_deleted: 1
							},
							conditions: {
								id: article.id
							},
							limit: 1
						}, nextArticle);
					});
				}
			}, (err) => {
				if(err)
					return setImmediate(() => callback(err));
					
				setImmediate(() => callback(null, changelogId));
			});
		});
	}
	
	this.reassign = reassign;
	
	function add(memo, next){
		async.eachOfSeries(memo.data.Entities, (entity, key, nextEntity) => {			
			datasource.insertOrUpdate(memo.changelog_id, {
				values: {
					article_id: memo.data.Article.id,
					entity_id: entity.id,
					count: (memo.data.ngrams[entity.tokens - 1][entity.caption] || []).length,
					is_deleted: 0
				},
				conditions: {
					article_id: memo.data.Article.id,
					entity_id: entity.id
				},
				update: {
					count: (prevEntry, nextEntry) => {
						return parseInt(prevEntry) + parseInt(nextEntry)
					}
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => nextEntity(err));
				
				//entity.id = insertId;				
				setImmediate(nextEntity);
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function addByEntity(memo, next){		
		async.eachOfSeries(memo.Articles, (sentences, articleId, nextArticle) => {			
			datasource.insertOrUpdate(memo.changelog_id, {
				values: {
					article_id: articleId,
					entity_id: memo.Entity.id,
					count: sentences.length,
					is_deleted: 0
				},
				conditions: {
					article_id: articleId,
					entity_id: memo.Entity.id
				},
				update: {
					count: (prevEntry, nextEntry) => {
						return parseInt(prevEntry.count) + parseInt(nextEntry.count)
					}
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => nextArticle(err));
				
				setImmediate(nextArticle);
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.addByEntity = addByEntity;
}

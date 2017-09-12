var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('Entity');
	var name = 'Entity'
		, models = _.defaults({Entity: this}, arguments[1] || {})
		, table = 'entities'
		, datasource = new DatasourceMysql(db, name, table)
		, ArticleEntity = models.ArticleEntity || (new (require('./ArticleEntity.js'))(db, models))
		, Relation = models.Relation || (new (require('./Relation.js'))(db, models))
		, Article = models.Article || (new (require('./Article.js'))(db, models))
		, EntitySentence = models.Article || (new (require('./EntitySentence.js'))(db, models))
		;
		
	function getAll(collectionId, callback){
		datasource.find('all', {
			fields: ['id', 'caption', 'type', 'show_always'],
			conditions: {
				master_id: null,
				collection_id: collectionId,
				is_deleted: 0
			}
		}, (err, entities) => {
			if(err)return setImmediate(() => callback(err));
			
			if(entities.length == 0)
				return setImmediate(() => callback(null, []));
			
			var idMap = {};
			
			for(var i = 0;i < entities.length; i++)
				idMap[entities[i].id] = i;
			
			ArticleEntity.getCounts(_.keys(idMap), (err, counts) => {
				if(err)return setImmediate(() => callback(err));
				
				if(counts != null)
					_.forOwn(counts, function(count, id){
						entities[idMap[id]]['count'] = count.total;
					});
					
				setImmediate(() => callback(null, entities));
			});
		});
	}
	
	this.getAll = getAll;
	
	function getInArticle(articleId, callback){
		ArticleEntity.getInArticle(articleId, (err, entitiesInArticle) => {
			if(_.isEmpty(entitiesInArticle))return setImmediate(() => callback(null, []));
			
			ArticleEntity.getDocumentfrequency(_.keys(entitiesInArticle), (err, df) => {	
				if(err)return setImmediate(() => callback(err));
				
				console.log(df);
				
				datasource.find('all', {
					fields: ['id', 'caption', 'type', 'show_always'],
					conditions: {
						id: _.keys(entitiesInArticle),
						master_id: null,
						is_deleted: 0
					}
				}, (err, entities) => {
					if(err)return setImmediate(() => callback(err));
					
					if(entities.length == 0)
						return setImmediate(() => callback(null, []));
					
					var maxTfidf = 0;
						
					for(var entity of entities){
						entity['count'] = entitiesInArticle[entity.id].total;
						if(_.isEmpty(df[entity.id]))
							entity['tfidf'] = 0;
						else
							entity['tfidf'] = entity['count'] / df[entity.id].df;
						
						if(entity.tfidf > maxTfidf)
							maxTfidf = entity.tfidf;
					}
					
					//Normalize tfidf
					if(maxTfidf > 0)
						for(var entity of entities)
							entity.tfidf = 1 / maxTfidf * entity.tfidf;
	
					setImmediate(() => callback(null, entities));
				});
			});
		});
	}
	
	this.getInArticle = getInArticle;
	
	function getById(/*entityId, [options, ], callback*/){
		var entityId = arguments[0]
			, options = {
				collection: null, //Check collectionId of entity?
				withMerged: false //Include merged nodes
			}
			, callback = arguments[arguments.length - 1]
			;
		
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
		
		var conditions = {
			is_deleted: 0
		};
		
		if(options.withMerged)
			conditions.or = {
				id: entityId,
				master_id: entityId
			};
		else
			conditions.id = entityId;
		
		if(!_.isNull(options.collection))
			conditions.collection_id = options.collection;
		
		datasource.find((options.withMerged || _.isArray(entityId))?'all':'first', {
			fields: ['id', 'master_id', 'multiword', 'value', 'caption', 'type', 'show_always'],
			conditions: conditions
		}, (err, entities) => {
			if(err)return setImmediate(() => callback(err));

			if(entities.length == 0)
				return setImmediate(() => callback(null, []));
				
			if(!options.withMerged)
				return setImmediate(() => callback(null, entities));
			
			entities = _.values(_.reduce(entities, function(result, entity, key){
				if(entity.master_id == null || entity.master_id == 0)
					result[entity.id] = _.defaults(entity, result[entity.id] || {});
				else{
					if(_.isUndefined(result[entity.master_id]))
						result[entity.master_id] = {};
					
					(result[entity.master_id]['merged'] || (result[entity.master_id]['merged'] = [])).push(entity);
				}
				return result;
			}, {}));
						
			if(!_.isArray(entityId) && entities[0])
				return setImmediate(() => callback(null, entities[0]));
			return setImmediate(() => callback(null, entities));
		});
	}
	
	this.getById = getById;
	
	function softdelete(/*entityId, userId,[ changelogId,]callback*/){
		var id = arguments[0]
			, userId = arguments[1]
			, changelogId = (arguments.length > 3)?arguments[2]:null
			, callback = arguments[arguments.length - 1]
			;
		
		async.waterfall([
			(next) => {
				if(!_.isNull(changelogId))return setImmediate(() => next(null, changelogId));
				datasource.startUpdate(userId, next);
			},
			(changelogId, next) => {
				datasource.update(changelogId, {
					values: {
						is_deleted: 1
					},
					conditions: {
						id: id
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
	
	this.softdelete = softdelete;
	
	function merge(/*targetId, sourceId, userId,[ changelogId,]callback*/){
		var targetId = arguments[0]
			, sourceId = arguments[1]
			, userId = arguments[2]
			, changelogId = (arguments.length > 4)?arguments[3]:null
			, callback = arguments[arguments.length - 1]
			;
		
		async.waterfall([
			(next) => {
				if(!_.isNull(changelogId))return setImmediate(() => next(null, changelogId));
				datasource.startUpdate(userId, next);
			},
			(changelogId, next) => { //Set id of the target node as masterId of the source node
				datasource.update(changelogId, {
					values: {
						master_id: targetId
					},
					conditions: {
						id: sourceId
					},
					limit: 1
				}, next);
			},
			(changelogId, next) => Relation.reassign(targetId, sourceId, changelogId, next), //Move relations of the source node to the target node
			(changelogId, next) => ArticleEntity.reassign(targetId, sourceId, changelogId, next) //Move article assignments
		], (err, changelogId) => {
			if(err)return setImmediate(() => callback(err));
			setImmediate(() => callback(null, {
				changelog_id: changelogId
			}));
		});
	}
	
	this.merge = merge;
	
	function findByValue(/*values, collectionId, callback*/){
		var values = arguments[0]
			, collectionId = arguments[1]
			, callback = arguments[arguments.length - 1]
			;
		
		datasource.find('all', {
			fields: ['id', 'master_id', 'multiword', 'value', 'caption', 'type', 'show_always'],
			conditions: {
				value: values,
				is_deleted: 0,
				collection_id: collectionId
			}
		}, (err, entities) => {
			if(err)return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, entities));
		});
	}
	
	this.findByValue = findByValue;
	
	function search(/*value, collectionId, callback*/){
		var value = arguments[0]
			, collectionId = arguments[1]
			, callback = arguments[arguments.length - 1]
			;
		
		datasource.find('all', {
			fields: ['id', 'master_id', 'multiword', 'value', 'caption', 'type', 'show_always'],
			conditions: {
				"value LIKE": '%' + value + '%',
				is_deleted: 0,
				collection_id: collectionId
			},
			limit: 8
		}, (err, entities) => {
			if(err)return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, entities));
		});
	}
	
	this.search = search;
	
	function add(memo, next){
		async.eachOfSeries(memo.data.Entities, (entity, key, nextEntity) => {
			if(!_.isUndefined(entity.id))return setImmediate(nextEntity);
			
			datasource.insertOrUpdate(memo.changelog_id, {
				values: {
					value: entity.value,
					tokens: entity.tokens,
					multiword: entity.multiword,
					caption: entity.caption,
					type: entity.type,
					collection_id: memo.Collection.id,
					last_seen: datasource.now(),
					is_deleted: 0,
					show_always: 0
				},
				conditions: {
					value: entity.value,
					tokens: entity.tokens,
					multiword: entity.multiword,
					collection_id: memo.Collection.id
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => nextEntity(err));
				
				entity.id = insertId;				
				setImmediate(nextEntity);
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function create(collectionId, entity, userId, options, callback){
		
		async.waterfall([
			(next) => {
				if(!_.isUndefined(options.changelogId) && !_.isNull(options.changelogId))return setImmediate(() => next(null, changelogId));
				datasource.startUpdate(userId, next);
			},
			(changelogId, next) => { //Add the entity to the database
				datasource.insert(changelogId, {
					values: {
						value: entity.value,
						tokens: entity.tokens,
						multiword: entity.multiword,
						caption: entity.caption,
						type: entity.type,
						collection_id: collectionId,
						last_seen: datasource.now(),
						is_deleted: 0,
						show_always: entity.show_always
					}
				}, (err, insertId) => {
					if(err)return setImmediate(() => next(err));
					
					entity.id = insertId;
					return setImmediate(() => next(null, {
						changelog_id: changelogId,
						collection_id: collectionId,
						Entity: entity,
						options: options
					}));
				});
				//setImmediate(() => next(null, changelogId));
			},
			(memo, next) => { //Find articles containing the entity
				Article.findWithToken(memo.collection_id, memo.Entity.caption, (err, articles) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Articles = articles.Articles;
					memo.Sentences = articles.Sentences;
					
					return setImmediate(() => next(null, memo));
				});
			},
			ArticleEntity.addByEntity, //Save ArticleEntity relation
			EntitySentence.addByEntity, //Save EntitySentences relations
			(memo, next) => { //Find relations of the entity
				if(!memo.options.find_relations)return setImmediate(() => next(null, memo));
				
				Relation.createForEntity(memo, next);
			}
		], (err, result) => {
			//console.log('Done add Entity', err, changelogId);
			
			if(err)return setImmediate(() => callback(err));
			setImmediate(() => callback(null, result));
		});
	}
	
	this.create = create;
}

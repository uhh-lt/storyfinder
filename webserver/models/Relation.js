var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('Relation');
	var name = 'Relation'
		, table = 'relations'
		, models = _.defaults({Relation: this}, arguments[1] || {})
		, datasource = new DatasourceMysql(db, name, table)
		, Relationtype = models.Relationtype || (new (require('./Relationtype'))(db, models))
		, Entity = models.Entity || (new (require('./Entity'))(db, models))
		, EntitySentence = models.EntitySentence || (new (require('./EntitySentence'))(db, models))
		, RelationSentence = models.RelationSentence || (new (require('./RelationSentence'))(db, models))
		;
	
	function getByEntities(/*collectionId, [options, ]callback*/){
		var entities = arguments[0]
			, options = {
				withTypes: false,
				withCounts: false,
				withEntities: false
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 2)options = _.defaults(arguments[1], options);

		if(entities.length == 0)return setImmediate(() => callback(null, []));

		datasource.find('all', {
			fields: ['id', 'entity1_id', 'entity2_id', 'relationtype_id', 'direction', 'user_generated'],
			conditions: {
				or: {
					entity1_id: entities,
					entity2_id: entities
				},
				is_deleted: 0
			}
		}, (err, relations) => {
			if(err)return setImmediate(() => callback(err));
			
			options.entity_id = entities;
			
			async.waterfall([
				(next) => setImmediate(() => next(null, {relations: relations, options: options})),
				_mFindTypes,
				_mGetCounts,
				_mGetEntities,
				_mSortByCount
			], (err) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, relations));
			});
		});
	}
	
	this.getByEntities = getByEntities;
	
	function getBetweenEntities(/*entity1Id, entity2Id, [options, ]callback*/){
		var entity1 = arguments[0]
			, entity2 = arguments[1]
			, options = {
				withType: false
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 3)options = _.defaults(arguments[2], options);

		datasource.find('first', {
			fields: ['id', 'entity1_id', 'entity2_id', 'relationtype_id', 'direction', 'user_generated'],
			conditions: {
				or: [
					{
						entity1_id: entity1,
						entity2_id: entity2
					},
					{
						entity1_id: entity2,
						entity2_id: entity1
					}
				],
				is_deleted: 0
			}
		}, (err, relation) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(relation))return setImmediate(() => callback(null, null));
				
			_mFindTypes({options: options, relations: [relation]}, (err, memo) => {
				if(err)return setImmediate(() => callback(err));
				setImmediate(() => callback(null, memo.relations[0]));
			});
		});
	}
	
	this.getBetweenEntities = getBetweenEntities;
	
	function reassign(/*target, source, changelogId, callback*/){
		console.log('Reassign relations');
		var targetId = arguments[0]
			, sourceId = arguments[1]
			, changelogId = arguments[2]
			, callback = arguments[arguments.length - 1]
			;
		
			getByEntities([targetId, sourceId], (err, relations) => {
				if(err)return setImmediate(() => callback(err));
				if(_.isEmpty(relations))return setImmediate(() => callback(null, changelogId));
				
				var byId = {}
				
				byId[targetId] = {};
				byId[sourceId] = {};
				
				relations.forEach(relation => {
					if(relation.entity1_id == sourceId)
						byId[sourceId][relation.entity2_id] = relation;
					else if(relation.entity2_id == sourceId)
						byId[sourceId][relation.entity1_id] = relation;
					else if(relation.entity1_id == targetId)
						byId[targetId][relation.entity2_id] = relation;
					else if(relation.entity2_id == targetId)
						byId[targetId][relation.entity1_id] = relation;
				});
				
				async.forEachOf(byId[sourceId], (relation, neighbourId, nextRelation) => {
					if(neighbourId == targetId){
						//The relation is between the two merged nodes => delete relation
						datasource.update(changelogId, {
							values: {
								is_deleted: 1
							},
							conditions: {
								id: relation.id
							},
							limit: 1
						}, nextRelation);
					}else if(_.isUndefined(byId[targetId][neighbourId])){
						//The target node has no relation to this neighbour => reassign
						datasource.update(changelogId, {
							values: {
								entity1_id: targetId,
								entity2_id: neighbourId //ToDo: With link directions we have to check which element was the neighbour!
							},
							conditions: {
								id: relation.id
							},
							limit: 1
						}, nextRelation);
					}else{
						//The target node has already a relation to this neighbour => reassign sentences
						RelationSentence.reassign(byId[targetId][neighbourId].id, relation.id, changelogId, nextRelation);
					}
				}, (err) => {
					if(err)
						return setImmediate(() => callback(err));
					
					setImmediate(() => callback(null, changelogId));
				});
			});
	}
	
	this.reassign = reassign;
	
	/*
		Find relationtypes	
	*/
	function _mFindTypes(memo, next){
		if(!memo.options.withTypes)
			return setImmediate(() => next(null, memo));

		var idMap = {};
		
		_.forEach(memo.relations, (relation, i) => {
			if(_.isNull(relation.relationtype_id))return;
			(idMap[relation.relationtype_id] || (idMap[relation.relationtype_id] = [])).push(i);
		});
		
		if(_.isEmpty(idMap))
			return setImmediate(() => next(null, memo));
		
		Relationtype.find(_.keys(idMap), (err, relationtypes) => {
			if(err)return setImmediate(() => next(err));
			if(!_.isEmpty(relationtypes))
				_.forOwn(relationtypes, (relationtype, relationtype_id) => {
					idMap[relationtype_id].forEach((key) => memo.relations[key].Relationtype = relationtype);
				});
				
			setImmediate(() => next(null, memo));
		});
	}
	
	/*
		Count sentences containing the relations	
	*/
	function _mGetCounts(memo, next){
		if(!memo.options.withCounts)
			return setImmediate(() => next(null, memo));
		
		var idMap = {};
		_.forEach(memo.relations, (relation, i) => idMap[relation.id] = i);

		if(_.isEmpty(idMap))
			return setImmediate(() => next(null, memo));
		
		RelationSentence.countByRelation(_.keys(idMap), (err, relationcounts) => {
			if(err)return setImmediate(() => next(err));
			if(!_.isEmpty(relationcounts))
				_.forOwn(relationcounts, (count, relation_id) => memo.relations[idMap[relation_id]].count = count.total);
				
			setImmediate(() => next(null, memo));
		});
	}
	
	/*
		Get entities	
	*/
	function _mGetEntities(memo, next){
		if(!memo.options.withCounts)
			return setImmediate(() => next(null, memo));
		
		var idMap = {};
		_.forEach(memo.relations, (relation, i) => {
			var nId = (relation.entity1_id == memo.options.entity_id)?relation.entity2_id:relation.entity1_id;
			relation.neighbour_id = nId;
			(idMap[nId] || (idMap[nId] = [])).push(i);
		});

		if(_.isEmpty(idMap))
			return setImmediate(() => next(null, memo));
		
		Entity.getById(_.keys(idMap), (err, entities) => {
			if(err)return setImmediate(() => next(err));
			if(!_.isEmpty(entities))
				_.forEach(entities, (entity) => {
					_.forEach(idMap[entity.id], (i) => {
						memo.relations[i].neighbour = entity;
					});
				});
				
			setImmediate(() => next(null, memo));
		});
	}
	
	/*
		Sort relations by sentence count	
	*/
	function _mSortByCount(memo, next){
		var max = 0;
					
		memo.relations.forEach(relation => {
			relation.count_log = Math.log(relation.count) + 1;
			
			if(relation.count_log > max)
				max = relation.count_log;
		});
		
		memo.relations.forEach(relation => {
			if(max == 0)
				relation.score = 0;
			else
				relation.score = 100 / max * (_.isUndefined(relation.count_log)?0:relation.count_log);
		});
	
		memo.relations.sort(function(a, b){
			return b.count - a.count;
		});
		
		setImmediate(() => next(null, memo));
	}
	
	
	function add(memo, next){
		//Filter new entities		
		async.eachOf(memo.data.relations, (relations, entity1, nextRelation1) => {
			var entity1_id = memo.data.Entities[entity1].id;
			
			async.eachOfSeries(relations, (sentences, entity2, nextRelation2) => {
				var entity2_id = memo.data.Entities[entity2].id;
				
				datasource.insertOrUpdate(memo.changelog_id, {
					values: {
						entity1_id: Math.min(entity1_id, entity2_id),
						entity2_id: Math.max(entity1_id, entity2_id),
						is_deleted: 0,
						user_generated: 0
					},
					conditions: {
						entity1_id: Math.min(entity1_id, entity2_id),
						entity2_id: Math.max(entity1_id, entity2_id)
					}
				}, (err, insertId) => {
					if(err)return setImmediate(() => nextRelation2(err));
					
					async.each(sentences, (sentenceKey, nextSentence) => {
						RelationSentence.add(memo.changelog_id, {
							relation_id: insertId,
							sentence_id: memo.data.sentences[sentenceKey].id
						}, (err) => setImmediate(() => nextSentence(err)));
					}, (err) => setImmediate(() => nextRelation2(err)));
				});
			}, (err) => {
				setImmediate(() => nextRelation1(err));
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function createForEntity(memo, callback){
		//We know all sentences containing the new entity => Lookup all other entities which are also contained in one of the sentences
		
		memo.Relations = [];
		
		var sentenceIds = _.map(memo.Sentences, 'id');
		EntitySentence.findBySentence(sentenceIds, {
			exclude: memo.Entity.id
		}, (err, entitySentences) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(entitySentences))return setImmediate(() => callback(null, memo));
			
			var entity1_id = memo.Entity.id;
			
			//Add relations
			async.eachOfSeries(entitySentences, (sentences, entity2_id, nextRelation) => {
				datasource.insertOrUpdate(memo.changelog_id, {
					values: {
						entity1_id: Math.min(entity1_id, entity2_id),
						entity2_id: Math.max(entity1_id, entity2_id),
						is_deleted: 0,
						user_generated: 0
					},
					conditions: {
						entity1_id: entity1_id,
						entity2_id: entity2_id
					}
				}, (err, insertId) => {
					if(err)return setImmediate(() => nextRelation(err));
					
					memo.Relations.push({
						id: insertId,
						entity1_id: entity1_id,
						entity2_id: entity2_id,
						relationtype_id: null,
						direction: null,
						user_generated: 0,
						label: null
					});
					
					async.each(sentences, (sentenceId, nextSentence) => {
						RelationSentence.add(memo.changelog_id, {
							relation_id: insertId,
							sentence_id: sentenceId
						}, (err) => setImmediate(() => nextSentence(err)));
					}, (err) => setImmediate(() => nextRelation(err)));
				});
			}, (err) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, memo));
			});
		});
	}
	
	this.createForEntity = createForEntity;
	
	function create(relation, callback){
		async.waterfall([
			(next) => datasource.startUpdate(relation.user_id, next),
			(changelogId, next) => {
				var memo = {
					Relation: relation,
					changelog_id: changelogId,
					Collection: relation.Collection,
					Sentence: {
						id: relation.sentenceId
					}
				};
				
				setImmediate(() => next(null, memo));
			},
			(memo, next) => { //Find relationtype for the label or create one
				console.log(memo);
				
				Relationtype.findByLabel(memo.Relation.label, memo.Collection.id, (err, relationtype) => {
					if(err)return setImmediate(() => next(err));
					if(!_.isEmpty(relationtype)){
						memo.Relationtype = relationtype;
						return setImmediate(() => next(null, memo));
					}
					
					var relationtype = {
						label: memo.Relation.label,
						collection_id: memo.Collection.id,
						is_deleted: 0
					};
					
					Relationtype.create(memo.changelog_id, relationtype, (err, relationtypeId) => {
						if(err)return setImmediate(() => next(err));
						
						relationtype.id = relationtypeId;
						memo.Relationtype = relationtype;
						
						setImmediate(() => next(null, memo));
					});
				});
			},
			(memo, next) => { //Find or create relation
				getBetweenEntities(memo.Relation.entity1_id, memo.Relation.entity2_id, (err, relation) => {
					if(err)return setImmediate(() => next(err));
					
					console.log(memo);
					
						
					datasource.insertOrUpdate(memo.changelog_id, {
						values: {
							entity1_id: Math.min(memo.Relation.entity1_id, memo.Relation.entity2_id),
							entity2_id: Math.max(memo.Relation.entity1_id, memo.Relation.entity2_id),
							relationtype_id: memo.Relationtype.id,
							is_deleted: 0,
							user_generated: _.isEmpty(relation)
						},
						conditions: {
							entity1_id: Math.min(memo.Relation.entity1_id, memo.Relation.entity2_id),
							entity2_id: Math.max(memo.Relation.entity1_id, memo.Relation.entity2_id)
						}
					}, (err, insertId) => {
						if(err)return setImmediate(() => next(err));
						
						memo.Relation.id = insertId;
						setImmediate(() => next(null, memo));
					});
				});
			},
			(memo, next) => { //Set relationtype for sentence
				if(_.isUndefined(memo.Sentence.id) || _.isNull(memo.Sentence.id))return setImmediate(() => next(null, memo));

				console.log(memo);

				RelationSentence.add(memo.changelog_id, {
					relation_id: memo.Relation.id,
					sentence_id: memo.Sentence.id,
					relationtype_id: memo.Relationtype.id
				}, (err) => setImmediate(() => next(err, memo)));
			}
		], (err, memo) => {
			if(err)return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, memo));
		});
	}
	
	this.create = create;
}

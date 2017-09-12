var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, evallog = new (require('../libs/evallog.js'))()
	;
	
module.exports = function(connection, app, passport){
	var User = new (require('../models/User.js'))(connection)
		, Relation = new (require('../models/Relation.js'))(connection)
		, Collection = new (require('../models/Collection.js'))(connection)
		, Entity = new (require('../models/Entity.js'))(connection)
		, RelationSentence = new (require('../models/RelationSentence.js'))(connection)
		;
		
	app.get('/Relations/Entity/:entityId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var entityId = parseInt(req.params.entityId)
			, userId = req.user.id
			;

		evallog.log('Get relations of entity ' + entityId);

		async.waterfall([
			(next) => {setImmediate(() => next(null, {user_id: userId, entity_id: entityId}))},
			_mGetCollection, //Get the id of user's default collection
			_mGetEntity, //Get the entity
			_mGetRelationsOfEntity, //Get relations of the entity	
		],
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	app.get('/Relations/:entity1Id/:entity2Id', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var entity1Id = parseInt(req.params.entity1Id)
			, entity2Id = parseInt(req.params.entity2Id)
			, userId = req.user.id
			;
			
		
		evallog.log('Get relations of entities ' + entity1Id + ' / ' + entity2Id);

		async.waterfall([
			(next) => {setImmediate(() => next(null, {user_id: userId, entity_ids: [entity1Id, entity2Id]}))},
			_mGetCollection, //Get the id of user's default collection
			_mGetEntity, //Get the entities
			_mGetRelationBetweenEntities, //Get relation
			_mGetSentences //Get sentences containing the relation
		],
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	app.put('/Relations/:entity1Id/:entity2Id', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var entity1Id = parseInt(req.params.entity1Id)
			, entity2Id = parseInt(req.params.entity2Id)
			, data = req.body
			, userId = req.user.id
			, sentenceId = req.body.sentence_id
			, label = req.body.label
			;

		evallog.log('Set relation of entities ' + entity1Id + ' / ' + entity2Id + ' with label ' + label);

		async.waterfall([
			(next) => {
				setImmediate(() => next(null, {
					user_id: userId,
					entity1_id: entity1Id,
					entity2_id: entity2Id,
					label: label,
					sentenceId: sentenceId
				}));
			},
			_mGetCollection,
			Relation.create
		],
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			result.Relation.Relationtype = result.Relationtype;
			
			res.send(result);
		});
	});
	
	/*
		Memo functions	
	*/
		/*
		Get the id of user's default collection	
		*/
		function _mGetCollection(memo, next){
			Collection.getDefault(memo.user_id, 
				(err, collection) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Collection = collection;
					
					setImmediate(() => next(null, memo))
				}
			);
		}
		
		/*
		Get the entity	
		*/
		function _mGetEntity(memo, next){
			Entity.getById(memo.entity_ids || memo.entity_id, {
					collection: memo.Collection.id,
					withMerged: true
				},
				(err, entity) => {
					if(err)return setImmediate(() => next(err));
					
					if(!_.isUndefined(memo.entity_ids))
						memo.Entities = entity;
					else
						memo.Entity = entity;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
		
		/*
			Get relations of the entity with neighbours
		*/
		function _mGetRelationsOfEntity(memo, next){
			Relation.getByEntities(memo.Entity.id, {
					withCounts: true,
					withTypes: true,
					withEntities: true
				},
				(err, relations) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Relations = relations;
					
					setImmediate(() => next(null, memo));
				}
			)
		}
		
		/*
			Get the relation between two entities
		*/
		function _mGetRelationBetweenEntities(memo, next){
			Relation.getBetweenEntities(memo.entity_ids[0], memo.entity_ids[1], 
				{
					withTypes: true
				},
				(err, relation) => {
					if(err)return setImmediate(() => next(err));
										
					memo.Relation = relation;
					
					setImmediate(() => next(null, memo));
				}
			)
		}
		
		/*
			Get sentences containing the relation	
		*/
		function _mGetSentences(memo, next){
			if(_.isEmpty(memo.Relation))return setImmediate(() => next(null, memo));
						
			RelationSentence.sentencesWithRelation(memo.Relation.id, {
				withArticles: true,
				withTypes: true,
				highlight: memo.Entities
			}, (err, sentences) => {
				if(err)return setImmediate(() => next(err));
				
				memo.Sentences = sentences;
				setImmediate(() => next(null, memo));
			});
		}
}
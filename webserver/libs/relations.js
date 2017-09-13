var fs = require('fs')
	, async = require('async')
	, _ = require('lodash')
	, colorThief = new (require('color-thief'))()
	, escapeStringRegexp = require('escape-string-regexp')
	, db = require('./changelog.js')
	;

module.exports = function(app, connection){
	/*Relation zwischen zwei Knoten ermitteln*/
	app.get('/:userId/relations/:entity1/:entity2', function(req, res){
		var userId = req.params.userId
			, entity1 = Math.min(req.params.entity1, req.params.entity2)
			, entity2 = Math.max(req.params.entity1, req.params.entity2)
			, ret = {relation: null, sentences: null}
			;
		
		async.series([
			function(callback){
				connection.query('SELECT relations.id `relation.id`, relations.entity1_id `relation.entity1_id`, relations.entity2_id `relation.entity2_id`, relations.relationtype_id `relation.relationtype_id`, relations.direction `relation.direction`, relations.user_generated `relation.user_generated`, entity1.id `entity1.id`, entity1.value `entity1.value`, entity1.multiword `entity1.multiword`, entity1.caption `entity1.caption`, entity1.type `entity1.type`, entity2.id `entity2.id`, entity2.value `entity2.value`, entity2.multiword `entity2.multiword`, entity2.caption `entity2.caption`, entity2.type `entity2.type`, relationtypes.id `relationtype.id`, relationtypes.label `relationtype.label` FROM relations INNER JOIN entities `entity1` ON (entity1.id = relations.entity1_id) INNER JOIN entities `entity2` ON (entity2.id = relations.entity2_id) LEFT JOIN relationtypes ON (relationtypes.id = relations.relationtype_id) WHERE relations.entity1_id=? and relations.entity2_id=? and entity1.user_id=? and entity2.user_id=? and entity1.is_deleted=0 and entity2.is_deleted=0 LIMIT 1', [entity1, entity2, userId, userId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					_.forOwn(results[0], function(value, key){
						key = key.split('.');
						if(_.isUndefined(ret[key[0]]) || _.isNull(ret[key[0]]))
							ret[key[0]] = {};
						ret[key[0]][key[1]] = value;
					});
					
					setImmediate(callback);
				});
			},
			//Daten laden, falls keine Beziehung besteht
			function(callback){
				if(!_.isNull(ret['relation'])){
					setImmediate(callback);
					return;
				}
				
				connection.query('SELECT entity1.id `entity1.id`, entity1.value `entity1.value`, entity1.multiword `entity1.multiword`, entity1.caption `entity1.caption`, entity1.type `entity1.type`, entity2.id `entity2.id`, entity2.value `entity2.value`, entity2.multiword `entity2.multiword`, entity2.caption `entity2.caption`, entity2.type `entity2.type` FROM entities `entity1` INNER JOIN entities `entity2` ON (entity1.id = ? and entity2.id=?) WHERE entity1.user_id=? and entity2.user_id=? and entity1.is_deleted=0 and entity2.is_deleted=0 LIMIT 1', [entity1, entity2, userId, userId], function(err, results, fields){
					if(err){
						return callback(err);
					}					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					_.forOwn(results[0], function(value, key){
						key = key.split('.');
						if(_.isUndefined(ret[key[0]]) || _.isNull(ret[key[0]]))
							ret[key[0]] = {};
						ret[key[0]][key[1]] = value;
					});
					
					setImmediate(callback);
				});
			},
			function(callback){
				if(_.isNull(ret.relation)){
					setImmediate(callback);
					return;
				}
								
				connection.query('SELECT relations_sentences.id `relation.relation_sentences_id`, relations_sentences.relationtype_id `relation.relationtype_id`, relations_sentences.direction `relation.direction`, sentences.id `sentence.id`, sentences.article_id `sentence.article_id`, sentences.text `sentence.text`, relationtypes.id `relationtype.id`, relationtypes.label `relationtype.label` FROM relations_sentences INNER JOIN sentences ON (relations_sentences.sentence_id = sentences.id) LEFT JOIN relationtypes ON (relations_sentences.relationtype_id = relationtypes.id) WHERE relations_sentences.relation_id=? and relations_sentences.is_deleted=0 and sentences.is_deleted=0', [ret.relation.id], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					ret.sentences = [];
					
					results.forEach(function(result){
						var relation = {};
						
						_.forOwn(result, function(value, key){
							key = key.split('.');
							if(_.isUndefined(relation[key[0]]))
								relation[key[0]] = {};
							relation[key[0]][key[1]] = value;
						});
						
						ret.sentences.push(relation);
					});
					
					setImmediate(callback);
				});
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send(ret);
		});
	});
	
	/*Relation speichern*/
	app.put('/:userId/relations/:entity1/:entity2', function(req, res){
		var userId = req.params.userId
			, entity1 = Math.min(req.params.entity1, req.params.entity2)
			, entity2 = Math.max(req.params.entity1, req.params.entity2)
			, relationId = null
			, relationtypeId = null
			, date = (new Date()).toISOString().slice(0,19).replace('T',' ')
			, relation = null
			;
				
		async.series([
			function(callback){
				connection.query('SELECT id, entity1_id, entity2_id, user_generated FROM relations WHERE entity1_id=? and entity2_id=? LIMIT 1', [entity1, entity2, userId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(!_.isNull(results) && results.length > 0){
						relationId = results[0].id;
						
						relation = _.defaults(results[0], {
							label: null,
							relationtype_id: null
						});
						
						setImmediate(callback);
						return;
					}else{
						connection.query('INSERT INTO relations (entity1_id, entity2_id, relationtype_id, direction, created, modified, is_deleted, user_generated) VALUES (?, ?, NULL, NULL, ?, ?, 0, 1)', [entity1, entity2, date, date], function(err, result){
							if(err){
								return callback(err);
							}
							
							relation = {
								id: result.insertId,
								entity1_id: entity1,
								entity2_id: entity2,
								label: null,
								relationtype_id: null,
								user_generated: 1
							};
							
							relationId = result.insertId;
							setImmediate(callback);
							return;	
						});
					}
				});
			},
			function(callback){
				connection.query('SELECT id FROM relationtypes WHERE label=? and user_id=? LIMIT 1', [req.body.label, userId], function(err, results, fields){
					if(err){
						return callback(err);
					}
										
					if(!_.isNull(results) && results.length > 0){
						relationtypeId = results[0].id;
						relation.label = req.body.label;
						setImmediate(callback);
						return;
					}else{
						connection.query('INSERT INTO relationtypes (label, user_id, created, modified) VALUES (?, ?, ?, ?)', [req.body.label, userId, date, date], function(err, result){
							if(err){
								callback(err);
								return;
							}
							
							relation.label = req.body.label;
							
							relationtypeId = result.insertId;
							setImmediate(callback);
						});
					}
				});
			},
			function(callback){
				connection.query('UPDATE relations SET relationtype_id=? WHERE id=? LIMIT 1', [relationtypeId, relationId], function(err, result){
					if(err){
						return callback(err);
					}
					
					setImmediate(callback);
				});
			},
			function(callback){
				if(_.isUndefined(req.body.sentence_id)){
					setImmediate(callback);
					return;
				}
				
				connection.query('UPDATE relations_sentences SET relationtype_id=? WHERE relation_id=? and sentence_id=? LIMIT 1', [relationtypeId, relationId, req.body.sentence_id], function(err, result){
					if(err){
						return callback(err);
					}
					
					setImmediate(callback);
				});
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				success: true,
				relationtype_id: relationtypeId,
				relation_id: relationId,
				relation: relation
			});
		});
	});
}
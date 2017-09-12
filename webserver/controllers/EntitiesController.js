var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, evallog = new (require('../libs/evallog.js'))()
	;
	
module.exports = function(connection, app, passport, io){
	var User = new (require('../models/User.js'))(connection)
		, Site = new (require('../models/Site.js'))(connection)
		, Collection = new (require('../models/Collection.js'))(connection)
		, Entity = new (require('../models/Entity.js'))(connection)
		;
		
	/*
	Search for sites and entities containing the string specified by query parameter 'q'	
	*/
	app.get('/Entities/search', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var search = req.query.q
			, userId = req.user.id
			;
			
		evallog.log('Search for ' + req.query.q);
		
		async.waterfall([
			(next) => {setImmediate(() => next(null, {user_id: userId, search: search}))},
			_mGetCollection, //Get the id of user's default collection
			(memo, next) => {
				Entity.search(memo.search, memo.Collection.id, (err, results) => {
					if(err)
						return setImmediate(() => next(err));
					
					memo.Entities = results;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => {
				Site.search(memo.search, memo.Collection.id, (err, results) => {
					if(err)
						return setImmediate(() => next(err));
					
					memo.Sites = results;
					setImmediate(() => next(null, memo));
				});
			}
			/*,
			sites: (next) => {
				Site.search(search, next);
			}*/
		], (err, results) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			console.log(results);
			res.send(results);
		});
	});
		
	app.get('/Entities/:entityId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var entityId = parseInt(req.params.entityId)
			, userId = req.user.id
			;

		evallog.log('Load entity ' + entityId);

		async.waterfall([
			(next) => {setImmediate(() => next(null, {user_id: userId, entity_id: entityId}))},
			_mGetCollection, //Get the id of user's default collection
			_mGetEntity, //Get the entity
			_mGetSites, //Get all sites for the articles	
		],
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
			
	/*
	Add a new entity
	*/
	app.put('/Entities', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id
			, data = req.body
			;
			
		evallog.log('Add new entity ' + JSON.stringify(req.body.data));

		async.waterfall([
			(next) => {setImmediate(() => next(null, {user_id: userId, data: data.data}))},
			_mGetCollection, //Get the id of user's default collection
			_mCreateEntity
		],
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			io.emit('new_entity', {
				nodes: [result.result.Entity],
				links: result.result.Relations
			});
			
			res.send({
				changelog_id: result.changelog_id,
				nodes: [result.result.Entity],
				links: result.result.Relations
			});
		});
	});
	
	/*
	Merge entities	
	*/
	app.put('/Entities/:targetId/:sourceId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var targetId = parseInt(req.params.targetId)
			, sourceId = parseInt(req.params.sourceId)
			, userId = req.user.id
			;
			
		evallog.log('Merge entities ' + sourceId + ' to ' + targetId);

		Entity.merge(targetId, sourceId, userId, (err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	app.delete('/Entities/:entityId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var entityId = req.params.entityId
			, userId = req.user.id
			;

		evallog.log('Delete entity ' + entityId);

		Entity.softdelete(entityId, userId, (err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
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
			Entity.getById(memo.entity_id, {
					collection: memo.Collection.id,
					withMerged: true
				},
				(err, entity) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Entity = entity;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
		
		/*
			Get all sites with articles containing the entity
		*/
		function _mGetSites(memo, next){
			Site.findWithEntity(memo.Entity, {
					withArticles: true,
					withSentences: true
				},
				(err, sites) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Sites = sites;
					
					setImmediate(() => next(null, memo));
				}
			)
		}
		
		/*
			Save a new entity	
		*/
		function _mCreateEntity(memo, next){
			var entity = {};
						
			entity.value =  memo.data.entity.name.replace(/^\s+/g,'').replace(/\s+$/g,'').split(/\s+/)
			, entity.tokens = entity.value.length
			, entity.multiword = (entity.value.length > 1)?entity.value.join(' '):null
			, entity.caption = entity.value.join(' ')
			, entity.type =  memo.data.entity.type
			, entity.show_always = _.isUndefined(memo.data.entity.show_always)?0:parseInt(memo.data.entity.show_always)
			;
		
			entity.value = entity.value[0];
			
			Entity.create(memo.Collection.id, entity, memo.user_id, {
				find_relations: typeof memo.data.options.find_relations != 'undefined' && parseInt(memo.data.options.find_relations) == 1
			}, (err, result) => {
				if(err)return setImmediate(() => next(err));
				
				memo.result = result;
				
				setImmediate(() => next(null, memo));
			});
		}
}


/*
	Neuen Knoten hinzufuegen	

	app.put('/:userId/nodes', function(req, res){
		var userId = req.params.userId
			, data = req.body.data
			, date = (new Date()).toISOString().slice(0,19).replace('T',' ')
			, node = {}
			, links = []
			;
			
		node.value = data.entity.name.replace(/^\s+/g,'').replace(/\s+$/g,'').split(/\s+/)
			, node.tokens = node.value.length
			, node.multiword = (node.value.length > 1)?node.value.join(' '):null
			, node.caption = node.value.join(' ')
			, node.type = data.entity.type
			, node.created = date
			, node.modified = date
			, node.last_seen = date
			, node.user_id = userId
			, node.show_always = _.isUndefined(data.entity.show_always)?0:parseInt(data.entity.show_always)
			;
		
		node.value = node.value[0];
				
		var articles = {};
		
		async.series([
			function(callback){
				connection.query('INSERT INTO entities (value, tokens, multiword, caption, type, created, modified, last_seen, user_id, is_deleted, show_always) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [node.value, node.tokens, node.multiword, node.caption, node.type, node.created, node.modified, node.last_seen, node.user_id, 0, node.show_always], function(err, result){
					if(err){
						return callback(err);
					}
					
					node.id = result.insertId;
					setImmediate(callback);
				});
			},
			//Relationen finden
			function(callback){
				if(typeof data.options.find_relations == 'undefined' || parseInt(data.options.find_relations) != 1){
					setImmediate(callback);
					return;
				}
				
				connection.query('SELECT sentences.id, sentences.text, sentences.article_id FROM sentences LEFT JOIN articles ON (sentences.article_id = articles.id) WHERE articles.user_id=? and articles.is_deleted=0 and sentences.is_deleted=0 and sentences.text LIKE ?', [userId, '%' + node.caption + '%'], function(err, results){
					if(err){
						callback(err);
						return;
					}
					
					if(results == null || _.isEmpty(results)){
						setImmediate(callback);
						return;
					}
										
					async.each(results, function(sentence, nextSentence){
						var vescaped = escapeStringRegexp(node.caption);
						var regs = [
							new RegExp('(\\\s' + vescaped + '\\\s)', 'g'),
							new RegExp('^(' + vescaped + '\\\s)', 'g'),
							new RegExp('(\\\s' + vescaped + ')$', 'g'),
							new RegExp('^(' + vescaped + ')$', 'g')
						];
						
						var isValid = false;
						
						regs.forEach(function(re){
							if(sentence.text.search(re) == -1)return false;
							isValid = true;
						})
						
						if(isValid){
							if(_.isUndefined(articles[sentence.article_id]))
								articles[sentence.article_id] = []
							articles[sentence.article_id].push(sentence);
						}						
	
						setImmediate(nextSentence);
					}, function(){
						async.forEachOf(articles, function(sentences, articleId, nextArticle){
							connection.query('SELECT entities.id, entities.value, entities.multiword FROM articles_entities INNER JOIN entities ON (entities.id = articles_entities.entity_id and articles_entities.article_id=?) WHERE entities.is_deleted=0 and articles_entities.is_deleted=0', [articleId], function(err, entities){
									if(err){
										setImmediate(function(){
											nextArticle(err);
										});
										return;
									}
									
									if(entities == null || _.isEmpty(entities)){
										setImmediate(nextArticle);
										return;
									}
									
									async.eachSeries(entities, function(entity, nextEntity){
										var needle = entity.value;
										if(!_.isNull(entity.multiword))
											needle = entity.multiword;
										
										async.each(sentences, function(sentence, nextSentence){
											if(sentence.text.indexOf(needle) == -1){
												setImmediate(nextSentence);
												return;
											}
																						
											console.log('Relation ' + needle + ' - ' + node.caption + ' found:', sentence.text);
											
											saveRelation(entity.id, node.id, sentence.id, function(err, relationId){
												if(err){
													setImmediate(function(){
														nextSentence(err);
													});
													return;
												}
												
												links.push({
													id: relationId,
													entity1_id: entity.id,
													entity2_id: node.id,
													relationtype_id: null,
													direction: null,
													user_generated: 0,
													label: null
												});
												
												nextSentence();
											});
										}, nextEntity);
									}, nextArticle);
							});
						}, callback);
					});
				});
			},
			//Zuordnung zu Artikel
			function(callback){				
				if(typeof data.article != 'undefined' && typeof data.article.id != 'undefined' && !_.isEmpty(data.article.id)){
					if(_.isUndefined(articles[parseInt(data.article.id)]))
						articles[parseInt(data.article.id)] = [];
				}
				
				var articleIds = _.keys(articles);
				
				if(_.isEmpty(articleIds)){
					setImmediate(callback);
					return;
				}
				
				var q = []
					, args = []
					;
				
				_.forOwn(articles, function(sentences, article){
					q.push('(?, ?, ?, 0)');
					args.push(article);
					args.push(node.id);
					args.push(Math.max(1, sentences.length));
				});
				
				console.log('INSERT INTO articles_entites (article_id, entity_id, count, is_deleted) VALUES ' + q.join(','));
				console.log(args);
				
				//setImmediate(callback);
				connection.query('INSERT INTO articles_entities (article_id, entity_id, count, is_deleted) VALUES ' + q.join(','), args, callback);
			},
		], function(err){
			if(err){
				console.log(err);
				res.sendStatus(500);
				return;
			}
			
			res.send({
				nodes: [node],
				links: links
			});
		});
	});
*/
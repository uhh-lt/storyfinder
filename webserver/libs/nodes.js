var fs = require('fs')
	, async = require('async')
	, _ = require('lodash')
	, escapeStringRegexp = require('escape-string-regexp')
	, db = require('./changelog.js')
	;
	
/*db.update('c', {
	table: 'entities',
	values: {
		'blub': 'blob',
		'bla': 'bla'
	},
	conditions: {
		'id <>': [5, 0, "8"],
		'or': {
			0: 'is_deleted IS NULL',
			'is_deleted': 0
		},
		'text': 'Test "Hallo!"'
	}
});*/

function decimalToHex(d, padding) {
    var hex = Number(d).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
}

module.exports = function(app, connection){
	/*
		Relationen einer Entität anzeigen
	*/	
	app.get('/:userId/nodes/:nodeId/relations', function(req, res){
		var userId = req.params.userId
			, nodeId = req.params.nodeId
			, node = null
			, sites = []
			, relations = []
			, relationIds = {}
			;
		
		async.series([
			function(callback){
				connection.query('SELECT id, multiword, value, caption, type, created, last_seen FROM entities WHERE user_id=? and id=? LIMIT 1', [userId, nodeId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					node = results[0];
					setImmediate(callback);
				});
			},		
			function(callback){
				connection.query('SELECT relations.id `relation.id`, IF(relations.entity1_id = ?, relations.entity2_id, relations.entity1_id) `relation.neighbour_id`, relations.entity1_id `relation.entity1_id`, relations.entity2_id `relation.entity2_id`, relations.relationtype_id `relation.relationtype_id`, relations.direction `relation.direction`, relations.user_generated `relation.user_generated`, relationtypes.id `relationtype.id`, relationtypes.label `relationtype.label`, relationtypes.pattern `relationtype.pattern`, neighbour.id `neighbour.id`, neighbour.caption `neighbour.caption`, neighbour.type `neighbour.type` FROM relations INNER JOIN entities `neighbour` ON ((relations.entity1_id = ? and relations.entity2_id = neighbour.id) or (relations.entity2_id = ? and relations.entity1_id = neighbour.id)) INNER JOIN entities `entity2` ON (relations.entity2_id = entity2.id) LEFT JOIN `relationtypes` ON (relations.relationtype_id = relationtypes.id) WHERE (entity1_id=? or entity2_id=?) and relations.is_deleted=0 and neighbour.is_deleted<>1 ORDER BY relations.created DESC', [nodeId, nodeId, nodeId, nodeId, nodeId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					results.forEach(function(result){
						var relation = {};
						
						_.forOwn(result, function(value, key){
							key = key.split('.');
							if(_.isUndefined(relation[key[0]]))
								relation[key[0]] = {};
							relation[key[0]][key[1]] = value;
						});
						
						relation.count = 0;
						
						relationIds[relation['relation']['id']] = relations.length;
						relations.push(relation);
					});
					
					setImmediate(callback);
				});
			},
			function(callback){
				if(_.isEmpty(relationIds)){
					setImmediate(callback);
					return;
				}
				
				connection.query('SELECT relations_sentences.relation_id `id`, count(*) as `count` FROM relations_sentences WHERE relations_sentences.relation_id IN (' + _.keys(relationIds).join(',') + ') and relations_sentences.is_deleted=0 GROUP BY relations_sentences.relation_id ORDER by `count` DESC', function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					var max = 0;
					
					results.forEach(function(result){
						var key = relationIds[result.id];
						relations[key]['count_log'] = Math.log(result.count) + 1;
						
						if(relations[key]['count_log'] > max)
							max = relations[key]['count_log'];
						
						relations[key]['count'] = result.count;
					});
								
					relations.forEach(function(relation){
						if(max == 0)
							relation.score = 0;
						else
							relation.score = 100 / max * (_.isUndefined(relation.count_log)?0:relation.count_log);
					});
				
					relations.sort(function(a, b){
						return b.count - a.count;
					});
					callback();
				});
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				node: node,
				relations: relations
			});
		});
	});
	
	/*
	Nachbarknoten ermitteln	
	*/
	app.get('/:userId/nodes/:nodeId/neighbours', function(req, res){
		var userId = req.params.userId
			, nodeId = req.params.nodeId
			, sites = null
			, articles = null
			, entities = null
			, links = null
			, renderNodes = []
			, renderLinks = []
			, linksById = {}
			, nodesInRenderGraph = {}
			;
		
		async.series([
			function(callback){
				connection.query('SELECT relations.id, relations.entity1_id, relations.entity2_id, relations.relationtype_id, relations.direction, relations.user_generated, relationtypes.label FROM relations LEFT JOIN relationtypes ON (relations.relationtype_id = relationtypes.id) WHERE (relations.entity1_id =? or relations.entity2_id=?) and relations.is_deleted=0', [nodeId, nodeId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					links = results;
					setImmediate(callback);
				})
			},
			function(callback){
				if(_.isUndefined(links) || _.isNull(links) || _.isEmpty(links)){
					setImmediate(callback);
					return;
				}
				
				connection.query('SELECT entities.id, entities.caption, entities.type, SUM(articles_entities.count) `count` FROM entities RIGHT JOIN articles_entities ON (articles_entities.entity_id=entities.id) WHERE entities.id IN (' + _.map(links, function(link){
					return (link.entity1_id == nodeId)?link.entity2_id:link.entity1_id;
				}).join(',') + ') and entities.is_deleted=0 GROUP BY entities.id', [], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					entities = results;
					setImmediate(callback);
					
				});
			},
			function(callback){
				if(!_.isEmpty(entities)){
					entities.forEach(function(entity){
						entity.pageRank = 0.5;
						entity.isTopNode = false;
						nodesInRenderGraph[entity.id] = entity;	
					});
				};
				
				if(!_.isEmpty(links)){
					links.forEach(function(link){
						linksById[link.id] = link;
					});
				};
				
				callback();
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				node: nodesInRenderGraph,
				relations: linksById
			});
		});
	});
	
	/*
		Zwei Entitäten mergen	
	*/
	app.put('/:userId/nodes/:targetId/merge/:sourceId', function(req, res){
		var userId = req.params.userId
			, sourceId = req.params.sourceId
			, targetId = req.params.targetId
			, targetRelations = {}
			, sourceArticles = null
			;
		
		async.series([
			//Master-Knoten setzen
			function(callback){
				connection.query('UPDATE entities SET master_id=? WHERE id=? and user_id=? LIMIT 1', [targetId, sourceId, userId], function(err){
					if(err){
						return callback(err);
					}
					
					setImmediate(callback);
				});
			},
			//Bestehende Relationen des Zielknotens ermitteln
			function(callback){
				connection.query('SELECT id, IF(entity1_id = ?, entity2_id, entity1_id) `neighbour` FROM relations WHERE entity1_id=? or entity2_id=?', [targetId, targetId, targetId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(results == null){
						targetRelations = {};
					}else{
						results.forEach(function(r){
							targetRelations[r.neighbour] = r.id;
						});
					}
					
					setImmediate(callback);
				});
			},
			//Bestehende Relationen des Quellknotens ermitteln
			function(callback){
				connection.query('SELECT id, IF(entity1_id = ?, entity2_id, entity1_id) `neighbour` FROM relations WHERE entity1_id=? or entity2_id=?', [sourceId, sourceId, sourceId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(results != null){
						async.each(results, function(r, nextRelation){
							if(_.isUndefined(targetRelations[r.neighbour]) && r.neighbour != targetId){								
								connection.query('UPDATE relations SET entity1_id=?, entity2_id=? WHERE id=? LIMIT 1', [Math.min(r.neighbour, targetId), Math.max(r.neighbour, targetId), r.id], nextRelation);
							}else{
								connection.query('UPDATE relations SET is_deleted=1 WHERE id=? LIMIT 1', [r.id], nextRelation);
							}
						}, callback);
					}
				});
			},
			//Beziehungen zu Artikeln ermitteln
			function(callback){
				connection.query('SELECT id, `article_id`, `count` FROM articles_entities WHERE entity_id=? and is_deleted=0', [sourceId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(results != null){
						sourceArticles = {};
						
						results.forEach(function(r){
							sourceArticles[r.article_id] = r;
						});
					}
					
					callback();
				});
			},
			function(callback){
				if(sourceArticles == null){
					return callback();
				}
				
				//console.log('SELECT id, `article_id`, `count` FROM articles_entities WHERE entity_id=? and is_deleted=0 and article_id IN (' + _.keys(sourceArticles).join(',') + ')');
				
				connection.query('SELECT id, `article_id`, `count` FROM articles_entities WHERE entity_id=? and is_deleted=0 and article_id IN (' + _.keys(sourceArticles).join(',') + ')', [targetId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(results != null){
						async.each(results, function(r, nextResult){
							var cntOld = sourceArticles[r.article_id].count;
							delete sourceArticles[r.article_id];
							
							connection.query('UPDATE articles_entities SET `count`=? WHERE id=? LIMIT 1', [r.count + cntOld, r.id], nextResult);
						}, callback);
					}else{
						callback();
					}
				});
			},
			function(callback){
				if(sourceArticles == null){
					return callback();
				}
				
				var articleIds = [];
				
				for(var article_id in sourceArticles){
					articleIds.push(article_id);
				}
				
				if(articleIds.length == 0){
					return callback();
				}
				
				//console.log('UPDATE articles_entities SET entity_id=?, is_deleted=0 WHERE entity_id=? and article_id IN (' + articleIds.join(',') + ')');
				
				connection.query('UPDATE articles_entities SET entity_id=?, is_deleted=0 WHERE entity_id=? and article_id IN (' + articleIds.join(',') + ')', [targetId, sourceId], callback);
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				success: true
			});
		});
	});
	
	/*
		Eine Entität löschen
	*/
	app.delete('/:userId/nodes/:nodeId', function(req, res){
		var userId = req.params.userId
			, nodeId = req.params.nodeId
			;
		
		async.series([
			//Master-Knoten setzen
			function(callback){
				db.update(connection, userId, {
					table: 'entities',
					values: {
						is_deleted: 1
					},
					conditions: {
						id: nodeId,
						user_id: userId
					},
					limit: 1
				}, callback);
				/*
				(err){
					connection.query('UPDATE entities SET is_deleted=1 WHERE id=? and user_id=? LIMIT 1', [nodeId, userId], function(err){
						if(err){
							return callback(err);
						}
						
						setImmediate(callback);
					});
				}	
				*/
			}
		], function(err, changelog_id){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				success: true,
				changelog: changelog_id
			});
		});
	});
	
	function saveRelation(entity1, entity2, sentence, done){
		var date = (new Date()).toISOString().slice(0,19).replace('T',' ')
			;
		
		connection.query('INSERT INTO relations (entity1_id, entity2_id, created, modified, is_deleted, user_generated) VALUES (?, ?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [entity1, entity2, date, date], function(err, result){
			if(err){
				done(err);
				return;
			}
			
			var relationId = result.insertId
				, args = []
				, q = []
				;
			
			connection.query('INSERT INTO relations_sentences (relation_id, sentence_id, created, is_deleted) VALUES (?, ?, ?, 0)', [relationId, sentence, date, 0], function(err, result){
				if(err){
					callback(err);
					return;
				}
				
				setImmediate(function(){
					done(null, relationId);
				});
			});
		});
	}
	
	/*
	Neuen Knoten hinzufuegen	
	*/
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
		
		//node.id = 90000 + Math.round(Math.random() * 10000);
		/*res.send({
			nodes: [node],
			links: []
		});*/
		
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
	
	/*
	Einzelne Entität anzeigen	
	*/
	app.get('/:userId/nodes/:nodeId', function(req, res){
		var userId = req.params.userId
			, nodeId = req.params.nodeId
			, node = null
			, sites = []
			;
		
		async.series([
			function(callback){
				connection.query('SELECT id, multiword, value, caption, type, created, last_seen FROM entities WHERE user_id=? and id=? LIMIT 1', [userId, nodeId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					node = results[0];
					setImmediate(callback);
				});
			},
			function(callback){
				connection.query('SELECT id, multiword, value, caption FROM entities WHERE user_id=? and master_id=?', [userId, nodeId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(!_.isNull(results)){
						node.nodes = results;
					}
					setImmediate(callback);
				});
			},
			function(callback){
				connection.query('SELECT sites.id `site.id`, sites.url as `site.url`, sites.host as `site.host`, sites.favicon `site.favicon`, sites.last_visited `site.last_visited`, sites.primary_color `site.primary_color`, sites.title `site.title`, articles.id `article.id`, articles.text `article.text`, articles_entities.count `article.count` FROM articles_entities INNER JOIN articles ON (articles.id = articles_entities.article_id) INNER JOIN sites ON (articles.site_id = sites.id) WHERE sites.is_deleted=0 and articles.is_deleted=0 and articles_entities.is_deleted=0 and entity_id=? ORDER by sites.last_visited DESC', [node.id], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					async.eachSeries(results, function(result, nextSite){
						var site = {};
						
						_.forOwn(result, function(value, key){
							key = key.split('.');
							if(_.isUndefined(site[key[0]]))
								site[key[0]] = {};
							site[key[0]][key[1]] = value;
						});
						
						site.site.shortUrl = site.site.url.substr(site.site.host.length);
						site.site.shortHost = site.site.host.replace(/^http(s)?\:\/\//,'').replace(/^www\./,'');
						
						//Ermitteln, ob der Hintergrund hell oder dunkel ist
						if(!_.isNull(site.site.primary_color)){
							/*
							Quelle: http://stackoverflow.com/questions/3942878/how-to-decide-font-color-in-white-or-black-depending-on-background-color
							*/						
							var rgb = site.site.primary_color.match(/.{1,2}/g);
							
							rgb = _.map(rgb, function(c){
								c = parseInt(c, 16);
								c = c / 255.0;
								c = (c <= 0.03928)?c/12.92:Math.pow((c+0.055)/1.055, 2.4);
								return c;
							});
							
							var l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
													
							if(l > 0.3)
								site.site.isLight = true;
							else
								site.site.isLight = false;
						}
						
						var nodevalues = [node.value];
						if(!_.isUndefined(node.multiword) && !_.isNull(node.multiword))
							nodevalues[0] = node.multiword;
						
						if(!_.isUndefined(node.nodes)){
							node.nodes.forEach(function(n){
								var v = n.value;
								if(!_.isUndefined(n.multiword) && !_.isNull(n.multiword))
									v = n.multiword;
									
								nodevalues.push(v);
							});
						}
						
						/*
						Sätze laden	
						*/
						connection.query('SELECT id, text FROM sentences WHERE article_id=? and is_deleted=0 ORDER by id ASC', [site.article.id], function(err, sresults, fields){
							if(err){
								return callback(err);
							}
						
							site.sentences = [];
							
							async.eachSeries(sresults, function(sentence, nextSentence){
								var html = sentence.text;
								var containsToken = false;
								
								nodevalues.forEach(function(v){
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
									site.sentences.push({
										id: sentence.id,
										text: sentence.text,
										html: html
									});

								setImmediate(nextSentence);
							}, function(err){
								sites.push(site);
								setImmediate(nextSite);
							});
						});
						
						//Sätze ermitteln, in denen die Entity vorkommt
						/*site.sentences = _.reject(_.map(site.article.text.split(/[\.\?\:\!]/g), function(sentence){
							var html = sentence;
							
							var containsToken = false;
							
							nodevalues.forEach(function(v){
								var start = sentence.indexOf(v);
								if(start == -1)return null;
								
								html = html.replace(new RegExp('(' + escapeStringRegexp(v) + ')', 'g'), "<strong>$1</strong>")
								containsToken = true;
							});
							
							if(!containsToken)return null;
							
							return {
								text: sentence,
								html: html
							};
						}), _.isNull);					
						
						sites.push(site);*/
					}, function(err){
						setImmediate(callback);
					});
									
					//article = results[0];
				});
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				sites: sites,
				node: node
			});
		});
	});
}

var async = require('async')
	, _ = require('lodash')
	, Pagerank = require('pagerank-js')
	;

module.exports = function(app, connection){
	app.get('/:userId/globalgraph', function (req, res) {
		var userId = req.params.userId
			, siteId = req.params.siteId
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
				connection.query('SELECT id, url, title, host, favicon, last_visited FROM sites WHERE user_id=? and is_deleted=0', [userId], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					sites = results;
					setImmediate(callback);
				});
			},
			function(callback){
				connection.query('SELECT id, text FROM articles WHERE site_id IN (' + _.map(sites, 'id').join(',') + ') and is_deleted=0', [], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					if(_.isNull(results) || results.length == 0){
						setImmediate(callback);
						return;
					}
					
					articles = results;
					setImmediate(callback);
				});
			},
			function(callback){
				if(_.isUndefined(articles) || _.isNull(articles)){
					setImmediate(callback);
					return;
				}
				
				connection.query('SELECT entities.id, entities.caption, entities.type, SUM(articles_entities.count) `count` FROM entities INNER JOIN articles_entities ON (articles_entities.entity_id=entities.id) WHERE articles_entities.article_id IN (' + _.map(articles, 'id').join(',') + ') and articles_entities.is_deleted=0 and entities.is_deleted=0 GROUP BY entities.id', [], function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					entities = results;
					setImmediate(callback);
					
				});
			},
			function(callback){
				var entity_ids = _.map(entities, 'id');
				
				if(entity_ids.length == 0){
					setImmediate(callback);
					return;
				}			
				
				connection.query('SELECT relations.id, relations.entity1_id, relations.entity2_id, relations.relationtype_id, relations.direction, relations.user_generated, relationtypes.label FROM relations LEFT JOIN relationtypes ON (relations.relationtype_id = relationtypes.id) WHERE (relations.entity1_id IN (' + entity_ids.join(',') + ') or relations.entity2_id IN (' + entity_ids.join(',') + ')) and relations.is_deleted=0', function(err, results, fields){
					if(err){
						return callback(err);
					}
					
					links = results;
					setImmediate(callback);
				})
			},
			function(callback){
				var linkProb = 0.85 //high numbers are more stable
					, tolerance = 0.0001 //sensitivity for accuracy of convergence. 
					, entityToIdx = {}
					, nodesForPagerank = []
					, linksByNode = {}
					;
					
				for(var i = 0;i < entities.length; i++)
					entityToIdx[entities[i].id] = i;
						
				for(var i = 0;i < links.length; i++){				
					var el = [entityToIdx[links[i].entity1_id], entityToIdx[links[i].entity2_id]];
					
					if(_.isUndefined(linksByNode[el[0]]))
						linksByNode[el[0]] = [];
					linksByNode[el[0]].push(el[1]);
						
					if(_.isUndefined(linksByNode[el[1]]))
						linksByNode[el[1]] = [];
					linksByNode[el[1]].push(el[0]);
				}
				
				for(var i = 0;i < entities.length; i++){
					if(_.isUndefined(linksByNode[i]))
						nodesForPagerank.push([]);
					else
						nodesForPagerank.push(linksByNode[i]);
				}
												
				Pagerank(nodesForPagerank, linkProb, tolerance, function (err, res) {		
				    if (err) return callback(err)
				
					var max = 0
						, min = 1
						;
					
					for(var i = 0;i < res.length; i++){
						if(res[i] > max)max = res[i];
						if(res[i] < min)min = res[i];
					}
					
					//Skalierung zwischen 0 und 1 vornehmen
					for(var i = 0;i < res.length; i++){
						var idx = i;
						
						if(min == max)
							entities[idx].pageRank = 0.5;
						else
							entities[idx].pageRank = (res[i] - min) / (max - min);
					}
					
					setImmediate(callback);
				});
			},
			function(callback){
				var maxTopNodes = 10
					, maxNeighbours = 2
					, linksByNode = {}
					;
				
				entities.sort(function(a, b){
					return b.pageRank - a.pageRank;
				});
											
				//Top 20 Knoten
				for(var i = 0; i < Math.min(maxTopNodes, entities.length); i++){
					entities[i].isTopNode = true;
					//renderNodes[entities[i].id] = entities[i];
					renderNodes.push(entities[i]);
					nodesInRenderGraph[i] = entities[i];
				}
				
				var entityToIdx = {}
					, nodesForPagerank = []
					;
					
				for(var i = 0;i < entities.length; i++){
					entityToIdx[entities[i].id * 1] = i;
					entities[i].idx = i;
				}
			
				for(var i = 0;i < links.length; i++){
					if(_.isUndefined(entityToIdx[links[i].entity1_id]))continue;
					if(_.isUndefined(entityToIdx[links[i].entity2_id]))continue;
					
					var el = [entityToIdx[links[i].entity1_id], entityToIdx[links[i].entity2_id]];
					
					if(_.isUndefined(linksByNode[el[0]]))
						linksByNode[el[0]] = [];
					linksByNode[el[0]].push(el[1]);
						
					if(_.isUndefined(linksByNode[el[1]]))
						linksByNode[el[1]] = [];
					linksByNode[el[1]].push(el[0]);
				}
				
				var k = _.keys(linksByNode);
				k.sort();
								
				var topNodesLength = renderNodes.length;
								
				//Jeweils die Top 3 Knoten fuer jeden Knoten im Rendergraph hinzufuegen
				for(var i = 0;i < topNodesLength; i++){
					//Alle benachbarten Knoten die noch nicht im Graph sind werden nach ihrem Pagerank sortiert und anschließend werden die Top 3 hinzugefuegt
					if(_.isEmpty(linksByNode[i]))continue;
					
					var remaining = [];
					_.each(linksByNode[i], function(neighbour){
						if(!_.isUndefined(nodesInRenderGraph[neighbour]))return;
						
						remaining.push({
							pageRank: entities[neighbour].pageRank,
							idx: neighbour
						});
					});
										
					if(_.isEmpty(remaining))continue;
					
					remaining.sort(function(a, b){
						return b.pageRank - a.pageRank;
					});
					
					for(var j = 0; j < Math.min(remaining.length, maxNeighbours); j++){
						var idx = remaining[j].idx;
						var n = renderNodes.length;
						
						entities[idx].isTopNode = false;
						renderNodes.push(entities[idx]);
						nodesInRenderGraph[idx] = entities[idx];
					}
				}
				
				/*
					Links by Node	
				*/				
				for(var i = 0;i < links.length; i++){					
					var el = [entityToIdx[links[i].entity1_id], entityToIdx[links[i].entity2_id]];
					
					if(_.isUndefined(nodesInRenderGraph[el[0]]))
						continue;
					if(_.isUndefined(nodesInRenderGraph[el[1]]))
						continue;
					
					renderLinks.push(links[i]);
					linksById[links[i].id] = links[i];
				}
				
				callback();
			}
		], function(err){
			if(err){
				res.sendStatus(500);
				console.log(err);
				return false;
			}
			
			res.send({
				/*sites: sites,
				articles: articles,*/
				nodes: nodesInRenderGraph,
				links: linksById
			});
		});
	});
}
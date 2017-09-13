var crypto = require('crypto')
	, async = require('async')
	, _ = require('lodash')
	, request = require('request')
	, Tokenizer = require('./tokenizer.js')
	, escapeStringRegexp = require('escape-string-regexp')
	, Corenlp = require("./corenlp.js");
	;
	
module.exports = function(connection, userId, data, doneHandleVisit){
	var isNew = false
		, article = data.plain
		, referrer = data.referrer
		, url = data.tabUrl
		, hash = crypto.createHash('md5').update(article).digest('hex')
		, articleId = null
		, siteId = null
		, sentences = null
		, tokens = null
		, entities = null
		, visitId = null
		, entitiesInArticle = {}
		, entitiesInDatabase = {}
		, links = {}
		, sentencesWithRelations = {}
		, date = (new Date()).toISOString().slice(0,19).replace('T',' ')
		, favicon = data.favicon
		, title = data.title
		, docsTotal = 1
		, tokensDetailed = {}
		, corenlp = new Corenlp({
				port: "9000",
				host: "192.168.99.100"
			}, {
				"pos.model": "edu/stanford/nlp/models/pos-tagger/german/german-hgc.tagger",
				"outputFormat": "json"
			})
		;
		
	function addSite(callback){
		connection.query('INSERT INTO sites (url, hash, host, user_id, favicon, title, created, last_visited, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', [
			url,
			hash,
			data.host,
			userId,
			favicon,
			title,
			date,
			date
		], function(err, result){
			if(err){
				callback(err);
				return;
			}
			
			siteId = result.insertId;
			
			callback();
		});
	}
	
	function countDocs(callback){
		connection.query('SELECT count(*) `docs` FROM articles WHERE user_id=?', [userId], function(err, results, fields){
			if(err){
				return callback(err);
			}
			
			if(!_.isNull(results))
				docsTotal = results[0].docs;			
			
			setImmediate(callback);
		});
	}
	
	function updateSiteVisit(callback){
		connection.query('UPDATE sites SET last_visited=? WHERE id=? LIMIT 1', [
			date,
			siteId
		], callback);
	}
	
	function loadArticle(callback){
		connection.query('SELECT articles.id, articles.site_id FROM articles WHERE articles.site_id=? ORDER BY created DESC LIMIT 1', [siteId], function(err, results, fields){
			if(err){
				return callback(err);
			}
			
			if(!_.isNull(results) && results.length > 0)
				articleId = results[0].id;				
			
			setImmediate(callback);
		});
	}
	
	function loadEntities(callback){
		connection.query('SELECT entities.id, entities.caption, entities.type, articles_entities.count, entities.value, entities.multiword FROM entities INNER JOIN articles_entities ON (articles_entities.entity_id=entities.id) WHERE articles_entities.article_id=? and articles_entities.is_deleted=0 and entities.is_deleted=0', [articleId], function(err, results, fields){
			if(err){
				return callback(err);
			}
			
			if(!_.isNull(results)){
				results.forEach(function(entity){
					entitiesInArticle[entity.id] = {
						id: entity.id,
						count: entity.count,
						token: _.isNull(entity.multiword)?entity.value:entity.multiword,
						type: entity.type
					};
				});
				
			}
			setImmediate(callback);
		});
	}
	
	function loadTokens(callback){
		connection.query('SELECT tokens.id `id`,tokens.token `token`,tokens.stemm `stemm`,tokens.pos `pos`,tokens.docs `docs`,articles_tokens.count `count` FROM tokens INNER JOIN articles_tokens ON (articles_tokens.article_id=? and articles_tokens.token_id = tokens.id)', [articleId], function(err, results){
			if(err){
				callback(err);
				return;
			}
			
			tokensDetailed = [];
			tokensDetailed = results;
						
			tokensTotal = 0;
			tokensDetailed.forEach(function(t){
				tokensTotal += parseInt(t.count);
			});
			
			console.log('Docs', docsTotal);
			
			tokensDetailed.forEach(function(token){
				token.tf = token.count / tokensTotal;
				token.idf = Math.log(docsTotal / token.docs);
				token.tfidf = token.tf * token.idf;
			});
			
			setImmediate(callback);
		});
	}
	
	function addArticle(callback){
		connection.query('INSERT INTO articles (site_id, raw, text, excerpt, byline, title, created, user_id, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', [
			siteId,
			data.content,
			data.plain,
			data.excerpt,
			data.byline,
			data.title,
			date,
			userId
		], function(err, result){
			if(err){
				callback(err);
				return;
			}
			
			articleId = result.insertId;
			
			callback();
		});
	}
	
	function parseOpennlp(callback){
		tokens = [];
		
		corenlp.tag(data.article.plain, {annotators: 'tokenize,ssplit,pos,lemma'}, function(err, results){	
			if(err){
				callback(err);
				return;
			}
						
			sentences = _.reject(_.map(results.sentences, function(sentence){
				if(_.isUndefined(sentence))
					return null;
				
				sentence.text = _.map(sentence.tokens, 'originalText').join(' ');
				_.each(sentence.tokens, function(t){
					tokens.push(t.originalText);
					var tokenKey = t.word + '|' + t.lemma + '|' + t.pos;
					if(_.isUndefined(tokensDetailed[tokenKey]))
						tokensDetailed[tokenKey] = {
							token: t.word,
							stemm: t.lemma,
							pos: t.pos,
							count: 1
						};
					else
						tokensDetailed[tokenKey].count++;
				});
				return sentence;
			}), _.isNull);
			
			setImmediate(callback);
		});
	}
	
	/*
	Sehr einfacher Sentence Splitter
	*/
	function splitSentences(callback){		
		sentences = _.map(data.article.plain.split(/[\.\?\:\!\n]/g), function(sentence){
			return {
				text: sentence
			};
		});
				
		callback()
	}
	
	/*
	Tokenizer	
	*/
	function tokenize(callback){
		_.each(sentences, function(sentence){
			sentence.tokens = Tokenizer.tokenize(sentence.text);
		});
		
		tokens = Tokenizer.tokenize(data.article.plain);
		callback();
	}
	
	function findEntitiesInDatabase(callback){
		async.forEachOf(tokens, function(token, key, nextToken){
			if(token.length == 0){
				nextToken();
				return;
			}
			
			token = token.replace(/^\s+/g,'').replace(/\s+$/g,'');
			
			connection.query('SELECT * FROM entities WHERE value=? and user_id=?', [token, userId], function(err, results, fields){
				if(err){
					nextToken(err);
					return;
				}
								
				if(!_.isEmpty(results)){
					var candidate = null;
					var max = 0;
										
					for(var i = 0; i < results.length; i++){
						//Pruefen, ob es sich um ein Multiword handeln koennte
						if(results[i].tokens == 1 && max == 0){
							candidate = results[i];
							max = 1;
						}else if(max < results[i].tokens){
							var needle = results[i].multiword.split(' ')
								, search = tokens.slice(key, key + needle.length).join(' ')
								;
								
							if(search == results[i].multiword){
								candidate = results[i];
								max = results[i].tokens;
							}
						}	
					}
					
					if(!_.isNull(candidate)){
						var cId = candidate.id;
						
						if(!_.isNull(candidate.master_id))
							cId = candidate.master_id;
						
						if(_.isUndefined(entitiesInArticle[cId]))
							entitiesInArticle[cId] = {
								id: cId,
								count: 0,
								token: _.isNull(candidate.multiword)?candidate.value:candidate.multiword,
								type: candidate.type
							};
							
						entitiesInArticle[cId].count++;
						entitiesInDatabase[_.isNull(candidate.multiword)?candidate.value:candidate.multiword] = cId;
					}
				}
				
				setImmediate(nextToken);
			});
		}, function(err){
			callback(null);
		});
	}
			
	function findEntities(callback){
		var data = [];

		_.each(sentences, function(sentence){
			var st = _.map(sentence.tokens, 'originalText').join("\n");
			
			//console.log('Sentence', st);
			if(st.replace(/\s+/g,'').length > 0){
				st = st.replace(/\n+/g, '\n');
				data.push(st);
			}
		});
		
		data = data.join("\n\n") + "\n.\n";
		
		request({
			uri: 'http://127.0.0.1:8080/germaner',
			method: 'POST',
			body: data,
			contentType: 'text/plain'
		}, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var entities = {};
				
				_.each(body.split('\n'), function(entity){
					entity = entity.replace(/^\s+/g,'').replace(/\s+$/g,'');
					if(entity.length > 0){									
						var tokens = entity.split(/\s+/g)
							, type = tokens.shift()
							, length = tokens.length
							, value = tokens[0]
							, entity = tokens.join(' ')
							, multiword = (length > 1)?entity:null
							;
							
						if(entity.length > 128){
							console.log('Entity to long', entity);
							return;
						}
						
						if(_.isUndefined(entities[entity]))
							entities[entity] = {
								type: type,
								tokens: length,
								value: value,
								multiword: multiword,
								count: 0
							};
							
						entities[entity].count++;
					}
				});
				
				if(_.isEmpty(entities)){
					setImmediate(callback);
					return;
				}
				
				async.forEachOf(entities, function(val, key, nextEntity){
					if(!_.isUndefined(entitiesInDatabase[key])){
						setImmediate(nextEntity);
						return;
					}
					
					connection.query('INSERT INTO entities (`value`, tokens, multiword, caption, type, created, user_id, last_seen, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE last_seen=VALUES(last_seen)', [
						val.value,
						val.tokens,
						val.multiword,
						key,
						val.type,
						date,
						userId,
						date
					], function(err, result){
						if(err){
							nextEntity(err);
							return;
						}
						
						entitiesInArticle[result.insertId] = {
							id: result.insertId,
							count: val.count,
							token: _.isNull(val.multiword)?val.value:val.multiword,
							type: val.type
						};
						entitiesInDatabase[key] = result.insertId;
						setImmediate(nextEntity);
					});
				}, callback);					
			}else{
				callback(error);
				return;
			}
		});
	}
	
	function addEntitiesToArticle(callback){
		if(_.isEmpty(entitiesInArticle)){
			setImmediate(callback);
			return;
		}
		
		var q = [];
		var args = [];
		
		for(var entity in entitiesInArticle){
			q.push('(?,?,?,0)');
			args.push(entity);
			args.push(articleId);
			args.push(entitiesInArticle[entity].count);
		}
		
		connection.query('INSERT INTO articles_entities (entity_id, article_id, `count`, is_deleted) VALUES ' + q.join(','), args, function(err, result){
			if(err){
				callback(err);
				return;
			}
			
			setImmediate(callback);
		});
	}
	
	function findCoocurrences(callback){
		var entityKeys = _.keys(entitiesInDatabase)
		;
		
		for(var i = 0;i < sentences.length; i++)
			sentences[i].index = i;
		
		async.each(sentences, function(sentence, nextSentence){
			for(var i = 0;i < entityKeys.length; i++){
				var entity1 = entityKeys[i];
								
				if(sentence.text.search(escapeStringRegexp(entity1)) == -1)continue;
				
				for(var j = i + 1; j < entityKeys.length; j++){
					var entity2 = entityKeys[j];
					
					if(entity1 == entity2)continue;
					if(sentence.text.search(escapeStringRegexp(entity2)) == -1)continue;
					
					var id1 = Math.min(entitiesInDatabase[entity1], entitiesInDatabase[entity2]),
						id2 = Math.max(entitiesInDatabase[entity1], entitiesInDatabase[entity2])
						;
										
					if(_.isUndefined(links[id1]))
						links[id1] = {};
					
					if(_.isUndefined(links[id1][id2]))
						links[id1][id2] = [];
					
					links[id1][id2].push(sentence.index);
					sentencesWithRelations[sentence.index] = sentence;
				}
			}
			setImmediate(nextSentence);
		}, callback);
	}
	
	function saveTokens(callback){
		async.forEachOfSeries(tokensDetailed, function(token, tokenKey, nextToken){
			connection.query('SELECT id, docs FROM tokens WHERE user_id=? and token=? and pos=? and stemm=? LIMIT 1', [userId, token.token, token.pos, token.stemm], function(err, result){
				if(err){
					nextToken(err);
					return;
				}
				
				var id = null;
				var docs = 1;
				
				async.series([
					function(next){
						if(!_.isNull(result) && result.length > 0){
							id = result[0].id;
							docs = result[0].docs + 1;
							connection.query('UPDATE tokens SET docs = ? WHERE id=? LIMIT 1', [docs, id], next);
						}else{
							connection.query('INSERT INTO tokens (token, user_id, pos, stemm, docs, created, modified, is_deleted) VALUES (?, ?, ?, ?, 1, ?, ?, 0) ', [token.token, userId, token.pos, token.stemm, date, date], function(err, r){
								if(err){
									console.log(result, [userId, token.token, token.pos, token.stemm]);
									next(err);
									return;
								}
								id = r.insertId;
								
								setImmediate(next);
							});
						}
					},
					function(next){
						token.docs = docs;
						token.tf = token.count / tokens.length;
						token.idf = Math.log(docsTotal / docs);
						token.tfidf = token.tf * token.idf;
						
						connection.query('INSERT INTO articles_tokens (article_id, token_id, count) VALUES (?, ?, ?)', [articleId, id, token.count], next);
					}
				], nextToken);
			});
		}, callback);
	}
	
	function saveSentences(callback){
		if(_.isEmpty(sentencesWithRelations)){
			setImmediate(callback);
			return;
		}
		
		async.forEachOf(sentencesWithRelations, function(sentence, sentenceIndex, nextSentence){
			connection.query('INSERT INTO sentences (article_id, text, created, is_deleted) VALUES (?, ?, ?, 0)', [articleId, sentence.text, date], function(err, result){
				if(err){
					nextSentence(err);
					return;
				}
				
				var id = result.insertId;
				sentences[sentenceIndex].id = id;
				
				setImmediate(nextSentence);
			});
		}, callback);
	}
	
	function saveRelations(callback){
		if(_.isEmpty(links)){
			setImmediate(callback);
			return;
		}
		
		var relations = [];
		
		for(var id1 in links){
			for(var id2 in links[id1]){
				relations.push({
					entity1: id1,
					entity2: id2,
					sentences: links[id1][id2]
				});
			}
		}
		
		async.each(relations, function(rel, nextRel){
			connection.query('INSERT INTO relations (entity1_id, entity2_id, created, modified, is_deleted, user_generated) VALUES (?, ?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [rel.entity1, rel.entity2, date, date], function(err, result){
				if(err){
					callback(err);
					return;
				}
				
				var relationId = result.insertId
					, args = []
					, q = []
					;
					
				for(var i = 0; i < rel.sentences.length; i++){
					q.push('(?, ?, ?, 0)');
					args.push(relationId)
					args.push(sentencesWithRelations[rel.sentences[i]].id);
					args.push(date);
				}
				
				connection.query('INSERT INTO relations_sentences (relation_id, sentence_id, created, is_deleted) VALUES ' + q.join(','), args, function(err, result){
					if(err){
						callback(err);
						return;
					}
					
					setImmediate(nextRel);
				});
			});
		}, callback);
	}
	
	function findReferrer(callback){
		if(_.isEmpty(referrer)){
			referrer = null;
			setImmediate(callback);
			return;
		}
		
		connection.query('SELECT id FROM sites WHERE url=? and user_id=? ORDER BY last_visited DESC LIMIT 1', [referrer, userId], function(err, results, fields){
			if(err){
				callback(err);
				return;
			}
			
			if(results.length > 0)
				referrer = results[0].id;
			else
				referrer = null;
			
			setImmediate(callback);
		});
	}
	
	function addVisit(callback){
		var cols = 	'site_id, user_id, created, is_deleted'
			, values = '?, ?, ?, 0'
			, args = [siteId, userId, date]
			;
			
		if(!_.isNull(referrer)){
			cols += ', referrer';
			values += ', ?';
			args.push(referrer);
		}
			
		connection.query('INSERT INTO visits (' + cols + ') VALUES (' + values + ')', args, function(err, result){
			if(err){
				callback(err);
				return;
			}
			
			visitId = result.insertId;
			
			setImmediate(callback);
		});
	}
	
	async.series([
		countDocs,
		function(next){
			connection.query('SELECT * FROM sites WHERE user_id=? and hash=? and url=? LIMIT 1', [userId, hash, url], function(err, results, fields){
				if(err){
					console.log(err);
					next(err);
					return false;
				}
				
				if(results.length > 0){
					siteId = results[0].id;
					isNew = false;
					setImmediate(function(){
					
						async.series([
							updateSiteVisit,
							loadArticle,
							loadEntities,
							loadTokens
						], next);
					});
					return;
				}
				
				isNew = true;
				
				async.series([
					addSite,
					addArticle,
					parseOpennlp,
					//splitSentences,
					//tokenize,
					findEntitiesInDatabase,
					findEntities,
					addEntitiesToArticle,
					findCoocurrences,
					saveTokens,
					saveSentences,
					saveRelations
				], next);
			});
		},
		findReferrer,
		addVisit
	], function(err){
		if(err){
			doneHandleVisit(err);
			return;
		}
		
		var t = _.values(tokensDetailed);
		t.sort(function(a, b){
			return b.tfidf - a.tfidf;
		});
		
		console.log(_.map(t.slice(0, 10), 'token'));
				
		doneHandleVisit(null, {
			isNew: isNew,
			site: {
				id: siteId
			},
			article: {
				id: articleId
			},
			visit: {
				id: visitId
			},
			entities: entitiesInArticle,
			tokens: t
		})
	});
}
var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, crypto = require('crypto')
	, path = require('path')
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, colorThief = require('colorthief')
	, createLogger = require('../utils/logger')
	;
const logger = createLogger('SitesController');

module.exports = function(connection, app, passport, io){
	var User = new (require('../models/User.js'))(connection);
	var Site = new (require('../models/Site.js'))(connection);
	var Article = new (require('../models/Article.js'))(connection);
	var Entity = new (require('../models/Entity.js'))(connection);
	var Collection = new (require('../models/Collection.js'))(connection);
	var Ngram = new (require('../models/Ngram.js'))(connection);
	var GermanerComponent = new (require('./components/GermanerComponent'))({
				port: process.env.GERMANER_PORT || "8080",
				host: process.env.GERMANER_HOST || "germaner"
			});
	var CorenlpComponent = new (require('./components/CorenlpComponent'))({
				port: process.env.CORENLP_PORT || "9000",
				host: process.env.CORENLP_HOST || "corenlp"
			}, {
				"pos.model": "edu/stanford/nlp/models/pos-tagger/german/german-hgc.tagger",
				"outputFormat": "json"
			});
	var StopwordComponent = new (require('./components/StopwordComponent.js'))();
	var KeywordComponent = new (require('./components/KeywordComponent.js'))(Ngram, Article);
	var RandomforestComponent = new (require('./components/RandomforestComponent.js'))('./data/trees.txt');
		;

	app.get('/Sites', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var page = _.isEmpty(req.query.page)?0:req.query.page
			, userId = req.user.id
			;

		async.waterfall([
			/*
			Get the id of user's default collection
			*/
			(next) => {
				Collection.getDefault(userId,
					(err, collection) => {
						if(err)return setImmediate(() => next(err));

						setImmediate(() => next(null, {
							Collection: collection
						}))
					}
				);
			},
			/*
			Get the sites in the collection
			*/
			(memo, next) => {
				Site.getAll(memo.Collection.id, page,
					(err, sites) => {
						if(err)return setImmediate(() => next(err));

						memo.Sites = sites;

						setImmediate(() => next(null, memo));
					}
				);
			}
		],
		(err, result) => {
			if(err){
				logger.error('site ingest failed', err);
				return setImmediate(() => res.sendStatus(500));
			}

			//console.log(result);

			res.send(result);
		});
	});

	/*
	Add a new site
	The method gets called by the plugin -> Use http auth instead of sessions and supply the credentials with every request

	Truncate:
		Truncate `articles`;
		Truncate `articles_entities`;
		Truncate `changelogs`;
		Truncate `changelogs_updates`;
		Truncate `entities`;
		Truncate `entities_sentences`;
		Truncate `ngrams`;
		Truncate `relations`;
		Truncate `relations_sentences`;
		Truncate `sentences`;
		Truncate `sites`;
		Truncate `visits`;
	*/
	function authAny(req, res, next) {
		if (req.user) return next();
		return passport.authenticate('basic', { session: false })(req, res, next);
	}

	app.put('/Sites', authAny, function (req, res) {
		var userId = req.user.id
			;

		logger.info('site ingest requested', { url: req.body.Site.url });

		io.emit('parsing_site', null);

		async.waterfall([
			(next) => setImmediate(() => next(null, {
				user_id: userId,
				data: req.body
			})),
			_mGetCollection, //Get the id of user's default collection
			_mGetOrAddSite, //Load the site if it's already registered or create a new site
			_mRegisterVisit //Register the visit
		],
		(err, result) => {
			if(err){
				logger.error('site ingest failed', err);
				return setImmediate(() => res.sendStatus(500));
			}

			delete result.data;

			if(_.isUndefined(result.is_parseable) || result.is_parseable)
				io.emit('new_site', result);
			else
				io.emit('done_parsing_site', null);

			res.send(result);
		});
	});

	app.put('/Sites/:siteId/image', passport.authenticate('basic', {session: false}), function(req, res){
		var userId = req.user.id
			, siteId = req.params.siteId
			, img = req.body.image.replace(/^data:image\/png;base64,/, "")
			;


		async.waterfall([
			(next) => setImmediate(() => next(null, {
				user_id: userId
			})),
			_mGetCollection, //Get the id of user's default collection
			(memo, next) => {
				logger.debug('saving site image', { basePath: ['..','public','images', '/' + memo.Collection.id, 'sites'].join('/') });
				async.reduce(['..', 'public', 'images', '/' + memo.Collection.id, 'sites'], __dirname, (p, folder, nextFolder) => {
					p = path.join(p, folder);

					fs.stat(p, (err, stats) => {
						if(err && err.code == 'ENOENT') {
							fs.mkdir(p, (err) => {
								if(err)return setImmediate(() => nextFolder(err));

								setImmediate(() => nextFolder(null, p));
							});
						}else if(err){
							return setImmediate(() => nextFolder(err));
						}else{
							return setImmediate(() => nextFolder(null, p));
						}
					});
				}, (err, p) => {
					if (err) logger.error('image path ensure failed', err);
					if(err)return setImmediate(() => next(err));

					memo.path = p;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => {
				var p = path.join(memo.path, siteId + '.png');

				fs.writeFile(p, img, 'base64', function(err){
					if(err)return setImmediate(() => next(err));

					memo.path = p;

					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => {
				fs.readFile(memo.path, (err, fileContent) => {
					if(err)return setImmediate(() => next(err));

					var rgb = colorThief.getColor(fileContent);
					var hex = _decimalToHex(rgb[0]) + _decimalToHex(rgb[1]) + _decimalToHex(rgb[2]);

					Site.setColor(siteId, hex, memo.user_id, (err) => {
						if(err)return setImmediate(() => next(err));

						memo.primary_color = hex;

						setImmediate(() => next(null, memo));
					});
				});
			}
		],
		(err, result) => {
			if(err){
				logger.error('site ingest failed', err);
				res.sendStatus(500);
				return false;
			}

			res.send({
				success: true
			});
		});
	});

	// Delete a site (and all parsed content) from UI
	app.delete('/Sites/:siteId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id,
			siteId = parseInt(req.params.siteId);

		logger.info('site delete requested', { siteId });

		async.waterfall([
			(next) => setImmediate(() => next(null, { user_id: userId, site_id: siteId })),
			_mGetCollection, // ensure we operate in user's default collection
			(memo, next) => { // verify site belongs to collection
				Site.getById(memo.site_id, memo.Collection.id, (err, site) => {
					if(err) return setImmediate(() => next(err));
					if(_.isEmpty(site)) return setImmediate(() => next({ code: 404 }));
					memo.Site = site;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => { // cascade soft-delete
				Site.softdeleteCascade(memo.site_id, memo.user_id, (err, result) => {
					if(err) return setImmediate(() => next(err));
					memo.result = result;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => { // try remove preview image if present (best-effort)
				var imgPath = path.join(__dirname, '..', 'public', 'images', '' + memo.Collection.id, 'sites', memo.site_id + '.png');
				fs.unlink(imgPath, (err) => {
					// ignore errors (file may not exist)
					setImmediate(() => next(null, memo));
				});
			}
		], (err, memo) => {
			if(err){
				if(err.code === 404){
					return res.sendStatus(404);
				}
				logger.error('site delete failed', err);
				return setImmediate(() => res.sendStatus(500));
			}

			res.send({ success: true, changelog_id: memo.result.changelog_id, site_id: memo.site_id });
		});
	});

		function _decimalToHex(d, padding) {
		    var hex = Number(d).toString(16);
		    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

		    while (hex.length < padding)
		        hex = "0" + hex;

		    return hex;
		}

		function _rowIsRelevant(row){
			row = row.trim();
			if(row.length == 0)return false;

			var cntAlphanumeric = row.length - row.replace(/[0-9A-ZÄÖÜa-zäöüß\-\,\.\?\s]/g,'').length;
			var ratioAlphanumeric = cntAlphanumeric / row.length;
			var tokens = row.split(/\s+/);

			// return ratioAlphanumeric >= 0.90 && tokens.length >= 6 && tokens.length < 25;
            return ratioAlphanumeric >= 0.90 && tokens.length >= 4 && tokens.length < 200;
		}

		function _isSiteRelevant(data, callback){
			//if the field data.Site.isRelevant is set to true than the site is marked as relevant by the user
			if(data.Article.isRelevant){
        logger.info('article metadata flagged relevant');
        return setImmediate(function() { callback(null, true); } );
      }

			var html = data.Article.content;
      var rows = data.Article.plain.split(/[\.\?\!\n]/g);
      rows = rows.filter(string => string.trim() !== "");

// TODO FIXME: something seems wrong here
console.log('plain article');
console.log(data.Article.plain);

console.log('split rows');
console.log(rows);

            var rowsRelevant = rows.filter(row => _rowIsRelevant(row));
	//		var total = data.Article.plain.replace(/\s/g, "").length;
            var total = rows.length;

			var d = {
				form: (html.match(/\<form/g) != null)?html.match(/\<form/g).length:0, //Form Elemente
				input: (html.match(/\<input/g) != null)?html.match(/\<input/g).length:0, //Input Elemente
				headlines: 1 + ( (html.match(/\<h\d/g) != null)?html.match(/\<h\d/g).length:0 ),//Ueberschriften
				paragraphs: (html.match(/\<p/g) != null)?html.match(/\<p/g).length:0, //Paragraphs
				breaks: Math.max(0, (html.match(/\<br/g) != null)?html.match(/\<br/g).length-3:0 ), //Breaks
				images: Math.max(0, (html.match(/\<img/g) != null)?html.match(/\<img/g).length-2:0 ), //Image
				tr: (html.match(/\<tr/g) != null)?html.match(/\<tr/g).length:0, //Tr
				// textratio: (total == 0) ? 0 : ((1 / total) * rowsRelevant.join('').replace(/\s/g, "").length)
                textratio: (total === 0) ? 0 : (rowsRelevant.length / total)
			};

// TODO FIXME: something seems wrong here
console.log('d');
console.log(d);

			/*

			var rows = _.filter(data.Article.plain.split('\n'), (row) => {
				row = row.replace(/^\s+/g,'').replace(/\s+$/g,'');

				if(row.length == 0)return false;

				var cntAlphanumeric = row.length - row.replace(/[A-Za-z\-\,\.\?\s]/g,'').length;
				var ratioAlphanumeric = 1 / row.length * cntAlphanumeric;

				if(ratioAlphanumeric < 0.95)return false;
				if(row.indexOf('.') == -1 && row.indexOf('!') == -1 && row.indexOf('?') == -1)return false;
				var tokens = row.split(/\s+/);
				if(tokens < 10)return false;

				return true;
			});

			var score = 1 / data.Article.plain.replace(/\s/g).length * rows.join('').replace(/\s/g).length;*/

			if(RandomforestComponent.classify(d) == 1)
				setImmediate(() => callback(null, true));
			else
				setImmediate(() => callback(null, false));
		}

		function _getOccurances(memo, candidate){
			var occurances = 0;

			memo.data.ngrams[0][candidate.value].forEach(occurance => {
				//check length of sentence
				var sentence = memo.data.sentences[occurance.sentence];
				var n = candidate.tokens;

				if(sentence.tokens.length - occurance.idx < n)return null;

				//Get n tokens
				var ngram = []
					, multiword = []
					;

				sentence.tokens.slice(occurance.idx, occurance.idx + n).forEach(token => {
					/*ngram.push({
						sentence: occurance.sentence,
						idx: occurence.idx
					});
					*/
					multiword.push(token.originalText);
				});

				multiword = multiword.join(' ');

				if(n > 3){
					ngram.push(1);
					//console.log(multiword, candidate.caption);
				}

				if(multiword != candidate.caption)return null;

				occurances++;

				//Found match
				if(_.isUndefined(memo.data.ngrams[n - 1]))
					memo.data.ngrams[n - 1] = {};

				(memo.data.ngrams[n - 1][multiword] || (memo.data.ngrams[n - 1][multiword] = [])).push({
						sentence: occurance.sentence,
						idx: occurance.idx
					});
			});

			return occurances;
		}

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

					setImmediate(() => next(null, memo));
				}
			);
		}

		/*
		Get a site or create one
		*/
		function _mGetOrAddSite(memo, next){
			//Create an md5 hash of the article content
			//console.log(memo.data.Article.plain);

			//console.log(memo.data.Site.hash);

			if(!_.isUndefined(memo.data.Article.isParseable) && memo.data.Article.isParseable == false)
				return setImmediate(() => next(null, {
					is_parseable: false
				}));

			memo.data.Site.hash = crypto.createHash('md5').update(memo.data.Article.plain).digest('hex');

			Site.findByUrl(memo.data.Site.url, memo.Collection.id, memo.data.Article.plain, {
				withArticle: true,
				withEntities: true,
				withRelations: false
			}, (err, site) => {
				if(err)return setImmediate(() => next(err));

				if(!_.isEmpty(site)){
					logger.info('site lookup result', { url: memo.data.Site.url })
					site.is_relevant = true;
					memo.Site = site;
					memo.is_new = memo.is_new || false;
					return setImmediate(() => next(null, memo))
				}

				//Site doesn't exist => check if the site is relevant
				_isSiteRelevant(memo.data, (err, bIsRelevant) => {
					if(err)return setImmediate(() => next(err));

					if(!bIsRelevant){
						logger.info('site marked not relevant');
						//Site is not relevant => stop here
						//memo.is_parsable = false;
						memo.is_relevant = false;
						memo.is_new = true;
						return setImmediate(() => next(null, memo))
					}

					memo.is_relevant = true;
					memo.is_new = true;

					logger.info('site marked relevant');

					//Site is relevant => add to database
					async.waterfall([
						(nextParse) => setImmediate(() => nextParse(null, memo)),
						function(memo, next){
							var retries = 1;
							async.doWhilst((nextWhile) => {
								_mParseOpenNLP(memo, function(err, nextMemo){
									if(err){
										retries--;
										logger.error('site image update failed', err);
										logger.info('retry parsing article using corenlp');
										setImmediate(nextWhile);
										return;
									}

									retries = -1;
									memo = nextMemo;
									setImmediate(nextWhile);
								});
							}, () => {
								return retries > 0;
							}, function(err){
								if(retries != -1)
									return setImmediate(() => next(new Error('Error parsing article')));
								setImmediate(() => next(null, memo));
							});
						},
						//_mFindEntities,
						//_mExtractNamedEntities,
						//_mFilterStopwords,
						//_mExtractKeywords,
						//_mExtractRelations,
						_mAddSite,
						//_mPostprocess,
						_mGetOrAddSite
					], next);
				});
			});
		}

		/*
		Parse site using OpenNLP

		The methods adds the following elements to memo.data
		- sentences: An array of all sentences in the article
		- ngrams: An array with [0] mono-, [1] bi- and [2] trigrams
		*/
		function _mParseOpenNLP(memo, next){
			tokens = [];

			var components = "tokenize,ssplit";
			if("corenlp" == process.env.NER){
				components = "tokenize,ssplit,ner";
			}

			CorenlpComponent.parse(memo.data.Article.plain, {annotators: components, timeout: 10000}, (err, results) => {
				if(err)return setImmediate(() => next(err));

				if(_.isUndefined(results))return setImmediate(() => next(new Error('Unable to parse article')));
				//console.log(results);
				memo.data.ngrams = [{}, {}, {}];
				var sentences = _.reject(results.sentences, _.isUndefined);
		
				memo.data.sentences = sentences;
				memo.data.entities = results.entities;
				memo.data.relations = results.relations;
				/*memo.data.sentences = sentences.map((sentence, sentenceIdx) => {
					sentence.text = _.map(sentence.tokens, 'originalText').join(' ');
					//console.log(sentence.text);
					sentence.tokens.forEach((t, i) => {
						var ngram = [];

						//Build n-grams
						for(var n = 0; n <= Math.min(i, memo.data.ngrams.length - 1); n++){
							ngram.unshift(sentence.tokens[i - n]);
							var key = _.map(ngram, 'originalText').join(' ');

							(memo.data.ngrams[n][key] || (memo.data.ngrams[n][key] = [])).push({
								sentence: sentenceIdx,
								idx: i - n
							});
						}
					});
					return sentence;
				});*/

				//console.log(memo.data.ngrams);

				setImmediate(() => next(null, memo));
			});
		}

		/*
		Find entities in the article already contained in the database
		*/
		function _mFindEntities(memo, next){
			/*
				Find all single word entities
			*/
			memo.data.Entities = {};
			logger.info('entity extraction started');
			var mwCandidates = []; //Entities which are candidates for multiwords
			Entity.findByValue(_.keys(memo.data.ngrams[0]), memo.Collection.id, (err, entities) => {
				if(err)return setImmediate(() => next(err));
				if(_.isEmpty(entities))return setImmediate(() => next(null, memo));

				//Filter multiwords
				entities.forEach(entity => {
					if(entity.tokens == 1)
						memo.data.Entities[entity.value] = entity;
					else
						mwCandidates.push(entity);
				});

				if(_.isEmpty(mwCandidates))return setImmediate(() => next(null, memo));

				/*
					Find multiword entities by checking all candidates
				*/
				async.each(mwCandidates, (candidate, doneCandidate) => {
					var n = parseInt(candidate.tokens);

					if(n <= 3){
						//For entities with 3 or less tokens we can use a simple lookup in the n-grams array
						if(_.isUndefined(memo.data.ngrams[n - 1][candidate.multiword]))
							return setImmediate(doneCandidate);

						memo.data.Entities[candidate.multiword] = candidate;
						return setImmediate(doneCandidate);
					}else{
						//For entities with more than 3 tokens we have to build new n-grams
						if(_.isUndefined(memo.data.ngrams[0][candidate.value]))return setImmediate(doneCandidate);

						//For each occurance of the first token of the entity
						if(!_.isEmpty(_getOccurances(memo, candidate)))
							memo.data.Entities[candidate.multiword] = candidate;

						setImmediate(doneCandidate);
					}
				}, (err) => {
					if(err)return setImmediate(() => next(err));

					setImmediate(() => next(null, memo));
				});
			});
		}

		/*
			Extract named entities in the article
		*/
		function _mExtractNamedEntities(memo, next){

			if("corenlp" != process.env.NER){

				logger.debug('extracting NEs from GermaNER');

				var sentences = memo.data.sentences.map(sentence => {
					return _.map(sentence.tokens, 'originalText')
				});

				GermanerComponent.parse(sentences, (err, entities) => {
					if(err)return setImmediate(() => next(err));

					entities.forEach(entity => {
						if(entity.value.length > 128){
							logger.debug('entity too long for merge', { entity });
							return;
						}

						if(
							entity.value.indexOf('\\') != -1
							|| entity.value.indexOf('"') != -1
							|| entity.value.indexOf("'") != -1
						)return;

						var tokens = entity.value.split(/\s+/g);
						entity = {
							type: entity.type,
							value: tokens[0],
							tokens: tokens.length,
							multiword: (tokens.length > 1)?entity.value:null,
							caption: entity.value
						};

						logger.debug('germaner entity type', { type: entity.type });


						//Add the entity to the memo array
						if(_.isUndefined(memo.data.Entities[entity.caption])){
							memo.data.Entities[entity.caption] = entity;

							if(_.isUndefined(memo.data.ngrams[entity.tokens - 1]))
								memo.data.ngrams[entity.tokens - 1] = {};

							if(_.isUndefined(memo.data.ngrams[entity.tokens - 1][entity.caption])){
								//console.log('Adding ' + entity.caption, entity.tokens - 1);
								//The n-gram of this entity is not in memo
								_getOccurances(memo, memo.data.Entities[entity.caption]);
							}
						}
					});

					setImmediate(() => next(null, memo));

				});
			} else {

				logger.debug('extracting NEs from CoreNLP');

				var entities = []
				// entities.push({
				// 	type: 'PER',
				//   value: 'Angela',
				//   tokens: 2,
				//   multiword: 'Angela Merkel',
				//   caption: 'Angela Merkel'
				// });
				//
				// entities.push({
				// 	type: 'ORG',
				// 	value: 'NBC',
				// 	tokens: 1,
				// 	multiword: null,
				// 	caption: 'NBC'
				// });

				var converttype = function(corenlptype){
					if(_.isUndefined(corenlptype) || corenlptype == null){
						return null;
					}

					switch(corenlptype.toLowerCase()){
						case "o" : return null;
						case "0" : return null;
						case "location" : return "LOC";
						case "organization" : return "ORG";
						case "org": return "ORG";
						case "loc": return "LOC";
						case "person" : return "PER";
						case "other" : return "OTH";
						case "misc" : return "OTH";
						case "number" : return null;
						default: return null;
					}
				}

				memo.data.sentences.forEach(sentence => {
					var entity = null;
					sentence.tokens.forEach(token => {
						var ctype = converttype(token.ner);

						// console.log("corenlp type:  " + token.ner);
						// console.log("germaner type: " + ctype);

						if(ctype == null){
							if(entity != null){
								entities.push(entity);
							}
							entity = null;
							return;
						}
						if(entity == null){
							entity = {
								type: ctype,
								value: token.originalText,
								tokens: 1,
								multiword: null,
								caption: token.originalText
							}
						}else{
							if(entity.type != ctype){
								entity = {
									type: ctype,
									value: token.originalText,
									tokens: 1,
									multiword: null,
									caption: token.originalText
								}
							}else{
								entity.caption = entity.caption + " " + token.originalText;
								entity.multiword = entity.caption;
								entity.tokens = entity.tokens+1;
							}
						}
					});
					if(entity != null){
						entities.push(entity);
					}
					entity = null;
				});

				entities.forEach(entity => {

					//console.log(entity);

					//Add the entity to the memo array
					if(_.isUndefined(memo.data.Entities[entity.caption])){
						memo.data.Entities[entity.caption] = entity;

						if(_.isUndefined(memo.data.ngrams[entity.tokens - 1]))
							memo.data.ngrams[entity.tokens - 1] = {};

						if(_.isUndefined(memo.data.ngrams[entity.tokens - 1][entity.caption])){
							//console.log('Adding ' + entity.caption, entity.tokens - 1);
							//The n-gram of this entity is not in memo
							_getOccurances(memo, memo.data.Entities[entity.caption]);
						}
					}
				});

				setImmediate(() => next(null, memo));

			}
		}

		/*
			Filter stopwords
		*/
		function _mFilterStopwords(memo, next){
			memo.data.ngrams.forEach((ngrams, n) => {
				var keys = _.keys(ngrams);
				keys.forEach((ngram) => {
					var tokens = ngram.split(' ');

					//Check if the ngram contains only stopwords
					var containsOnlyStopwords = _.reduce(tokens, (isStopword, token, key) => {
						return isStopword && StopwordComponent.is(token);
					}, true);

					//Check if first or last element is stopword
					if(StopwordComponent.is(tokens[0]) || StopwordComponent.is(tokens[tokens.length - 1]))
						containsOnlyStopwords = true;

					//Ngram has to contain at least one character A-Za-z => Filter numbers and symbols
					if(!ngram.match(/[A-Za-z]/))
						containsOnlyStopwords = true;

					if(containsOnlyStopwords){
						//console.log('Removing stopword: ' + ngram);
						delete ngrams[ngram];
					}
				});
			});

			setImmediate(() => next(null, memo));
		}

		/*
			Extract keywords
		*/
		function _mExtractKeywords(memo, next){
			if(process.env.NO_KEYWORDS){
				setImmediate(() => next(null, memo));
				return;
			}

			async.eachOfSeries(memo.data.ngrams, (ngrams, n, nextN) => {
				var candidates = {};
				_.forOwn(ngrams, (sentences, ngram) => {
					var ngramL = ngram.toLowerCase();
					if(_.isUndefined(candidates[ngramL]))
						candidates[ngramL] = {
							length: sentences.length,
							caption: ngram
						}
					else
						candidates[ngramL].length += sentences.length;
				});

				KeywordComponent.getKeywords(candidates, n, memo.Collection.id, (err, keywords) => {
					var added = 0;
					if(!_.isEmpty(keywords))
						keywords.forEach(keyword => {
							if(!_.isUndefined(memo.data.Entities[keyword]))return; //skip if the keyword is already in the entity list (already in database or NE)
							if(added >= 5)return; //Add at least 5 keywords

							var kTokens = keyword.toLowerCase().split(' ');

							//Check if keyword is contained in any entity
							for(var entity in memo.data.Entities){
								var tokens = {};
								if(memo.data.Entities[entity].tokenMap)
									tokens = memo.data.Entities[entity].tokenMap;
								else{
									entity.toLowerCase().split(' ').forEach((t) => tokens[t] = true);
									memo.data.Entities[entity].tokenMap = tokens;
								}

								var containsToken = kTokens.reduce((b, t) => {
									return b || tokens[t] || false;
								}, false);

								if(containsToken){
									logger.debug('keyword partially contained in entity', { keyword, entity });
									return;
								}
							}
							added++;
							var tokens = keyword.split(' ');

							memo.data.Entities[keyword] = {
								type: 'KEY',
								value: tokens[0],
								tokens: tokens.length,
								multiword: (tokens.length > 1)?keyword:null,
								caption: keyword
							}
						});

					setImmediate(nextN);
				});
			}, (err) => {
				if(err)return setImmediate(() => next(err));

				setImmediate(() => next(null, memo));
			});
		}

		/*
			Extract relations (Cooccurrences)
		*/
		function _mExtractRelations(memo, next){
			logger.info('relation extraction started');
			var _entities = _.values(memo.data.Entities);

			memo.data.relations = {};
			memo.data.merge = {};

			_entities.forEach((entity1, i) => {
				var sentences1 = {};

				if(_.isUndefined(memo.data.ngrams[entity1.tokens - 1]) || _.isUndefined(memo.data.ngrams[entity1.tokens - 1][entity1.caption]))return;

				memo.data.ngrams[entity1.tokens - 1][entity1.caption].forEach(o => sentences1[o.sentence] = true);

				for(i++; i < _entities.length; i++){
					var entity2 = _entities[i]
						, sentences2 = memo.data.ngrams[entity2.tokens - 1][entity2.caption]
						;

					if(_.isUndefined(sentences2)){
						//console.log(entity2.tokens - 1, entity2.caption);
						continue;
					}

					sentences2.forEach(o => {
						if(_.isUndefined(sentences1[o.sentence]))return null;

						var key1 = (entity1.caption.localeCompare(entity2.caption) > 0)?entity2.caption:entity1.caption
							, key2 = (entity1.caption.localeCompare(entity2.caption) > 0)?entity1.caption:entity2.caption
							;

						if(_.isUndefined(memo.data.relations[key1]))
							memo.data.relations[key1] = {};

						var c1 = key1.toLowerCase();
						var c2 = key2.toLowerCase();

						if(entity1.type == 'PER' && entity2.type == 'PER'){
							//Find related similar names, e.g. Angela Merkel + Merkel and merge them during post processing
							if(c1.substr(c1.length - c2.length - 1) == ' ' + c2)
								(memo.data.merge[key1] || (memo.data.merge[key1] = {}))[key2] = true;
							else if(c2.substr(c2.length - c1.length - 1) == ' ' + c1)
								(memo.data.merge[key2] || (memo.data.merge[key2] = {}))[key1] = true;
						}

						//Find related similar names, e.g. Trump + Trumps or Italien + Italiens
						if(c1 + 's' == c2)
							(memo.data.merge[key1] || (memo.data.merge[key1] = {}))[key2] = true;
						else if(c2 + 's' == c1)
							(memo.data.merge[key2] || (memo.data.merge[key2] = {}))[key1] = true;

						(memo.data.relations[key1][key2] || (memo.data.relations[key1][key2] = [])).push(o.sentence);
					});
				}
			});

			setImmediate(() => next(null, memo));
		}

		/*
			Register visit
		*/
		function _mRegisterVisit(memo, next){
			logger.info('register visit');
			//ToDo
			setImmediate(() => next(null, memo));
		}

		function _mAddSite(memo, next){
			logger.info('Adding Site')

			Site.add(memo, (err, result) => {
				if(err)return setImmediate(() => next(err));

				memo.changelog_id = result.changelog_id;
				memo.data.Site.id = result.id;

				logger.info('site added to collection');

				setImmediate(() => next(null, memo));
			});
		}

		function _mPostprocess(memo, next){
			if(_.keys(memo.data.merge).length == 0)
				return setImmediate(() => next(null, memo));

			async.forEachOfSeries(memo.data.merge, (sources, targetName, nextTarget) => {
				var targetId = memo.data.Entities[targetName].id;

				async.forEachOfSeries(sources, (b, sourceName, nextSource) => {
					var sourceId = memo.data.Entities[sourceName].id;

					logger.debug('entity merge prepared', { targetId, targetName, sourceId, sourceName });
					//setImmediate(nextSource);
					Entity.merge(targetId, sourceId, memo.user_id, memo.changelog_id, nextSource);
				}, (err) => {
					logger.debug('entity merge source completed');
					nextTarget();
				});
			}, (err) => {
				if(err)
					return setImmediate(() => next(err));

				setImmediate(() => next(null, memo));
			});
			/*targetId, sourceId, userId,[ changelogId,]callback*/
		}
}

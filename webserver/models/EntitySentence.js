var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	var name = 'EntitySentence'
		, models = _.defaults({EntitySentence: this}, arguments[1] || {})
		, table = 'entities_sentences'
		, datasource = new DatasourceMysql(db, name, table)
		;
		
	function findBySentence(/*sentenceIds,[ options,] callback*/){
		var sentenceIds = arguments[0]
			, options = {
				exclude: null
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
			
		var conditions = {
			sentence_id: sentenceIds,
			is_deleted: 0
		};
		
		if(!_.isNull(options.exclude))
			conditions['entity_id <>'] = options.exclude;
		
		datasource.find('all', {
			fields: ['id', 'sentence_id', 'entity_id'],
			conditions: conditions
		}, (err, results) => {
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(results))return setImmediate(() => callback(null, {}));
			
			var values = {};
			results.forEach(r => (values[r.entity_id] || (values[r.entity_id] = [])).push(r.sentence_id));
			
			setImmediate(() => callback(null, values));
		});
	}
	
	this.findBySentence = findBySentence;
	
	function add(memo, next){
		async.eachOfSeries(memo.data.Entities, (entity, key, nextEntity) => {
			
			//Sentences of entity
			if(_.isUndefined(memo.data.ngrams[entity.tokens - 1]) || _.isUndefined(memo.data.ngrams[entity.tokens - 1][entity.caption]))
				return setImmediate(nextEntity);
							
			async.eachSeries(memo.data.ngrams[entity.tokens - 1][entity.caption], (o, nextSentence) => {
				var sentenceId = memo.data.sentences[o.sentence].id;
				
				datasource.insertOrUpdate(memo.changelog_id, {
					values: {
						sentence_id: sentenceId,
						entity_id: entity.id,
						is_deleted: 0
					},
					conditions: {
						sentence_id: sentenceId,
						entity_id: entity.id
					}
				}, (err, insertId) => {
					if(err)return setImmediate(() => nextEntity(err));
			
					setImmediate(nextSentence);
				});
			}, nextEntity);
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function addByEntity(memo, next){
		async.eachSeries(memo.Sentences, (sentence, nextSentence) => {
			var sentenceId = sentence.id;
			
			datasource.insertOrUpdate(memo.changelog_id, {
				values: {
					sentence_id: sentenceId,
					entity_id: memo.Entity.id,
					is_deleted: 0
				},
				conditions: {
					sentence_id: sentenceId,
					entity_id: memo.Entity.id
				}
			}, (err, insertId) => {
				if(err)return setImmediate(() => nextEntity(err));
		
				setImmediate(nextSentence);
			});
		}, (err) => {
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.addByEntity = addByEntity;
}

var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('RelationSentence');
	var name = 'RelationSentence'
		, table = 'relations_sentences'
		, models = _.defaults({RelationSentence: this}, arguments[1] || {})
		, datasource = new DatasourceMysql(db, name, table)
		, Sentence = models.Sentence || (new (require('./Sentence.js'))(db, models))
		, Relationtype = models.Relationtype || (new (require('./Relationtype.js'))(db, models))
		;
		
	function countByRelation(relations, callback){
		datasource.find('list', {
			fields: ['relation_id', 'count(*) `total`'],
			conditions: {
				relation_id: relations,
				is_deleted: 0
			},
			group: 'relation_id'
		}, callback);
	}
	
	this.countByRelation = countByRelation;
	
	function sentencesWithRelation(/*relationId,[ options,]callback*/){
		var relationId = arguments[0]
			, options = {
				withArticles: false,
				withTypes: false,
				highlight: null
			}
			, callback = arguments[arguments.length - 1]
			;
			
		if(arguments.length > 2)
			options = _.defaults(arguments[1], options);
			
		datasource.find('all', {
			fields: ['sentence_id', 'relationtype_id', 'direction'],
			conditions: {
				relation_id: relationId,
				is_deleted: 0
			}
		}, (err, relations_sentences) => {
			console.log(relations_sentences);
			
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(relations_sentences))return setImmediate(() => callback(null, []));
			
			var idMap = {};
			relations_sentences.forEach((sentence, i) => idMap[sentence.sentence_id] = i);
			Sentence.findById(_.keys(idMap), {withArticles: options.withArticles, highlight: options.highlight}, (err, sentences) => {
				if(err)return setImmediate(() => callback(err));
								
				sentences.forEach(sentence => {
					var key = idMap[sentence.id];
					sentence.RelationSentence = relations_sentences[key];
				});
								
				if(!options.withTypes)
					return setImmediate(() => callback(null, sentences));
					
				idMap = {};
				sentences.forEach((sentence, i) => {
					if(!_.isNull(sentence.RelationSentence.relationtype_id))
						(idMap[sentence.RelationSentence.relationtype_id] || (idMap[sentence.RelationSentence.relationtype_id] = [])).push(i);
				});
				
				if(_.isEmpty(idMap))
					return setImmediate(() => callback(null, sentences));
					
				Relationtype.find(_.keys(idMap), (err, relationtypes) => {
					if(err)return setImmediate(() => callback(err));
					if(!_.isEmpty(relationtypes))
						_.forOwn(relationtypes, (relationtype, relationtype_id) => {
							idMap[relationtype_id].forEach((key) => sentences[key].Relationtype = relationtype);
						});
						
					setImmediate(() => callback(null, sentences));
				});
			});
		});
	}
	
	this.sentencesWithRelation = sentencesWithRelation;
	
	function reassign(/*targetRelationId, sourceRelationId, changelogId, callback*/){
		var targetRelationId = arguments[0]
			, sourceRelationId = arguments[1]
			, changelogId = arguments[2]
			, callback = arguments[arguments.length - 1]
			;

		datasource.update(changelogId, {
			values: {
				relation_id: targetRelationId
			},
			conditions: {
				relation_id: sourceRelationId
			}
		}, callback);
	}
	
	this.reassign = reassign;
	
	function add(changelogId, data, callback){
		var values = {
				relation_id: data.relation_id,
				sentence_id: data.sentence_id,
				relationtype_id: data.relationtype_id || null,
				is_deleted: 0
			};
		
		datasource.insert(changelogId, {
			values: values
		}, (err, insertId) => {
			if(err)return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, insertId));
		});
	}
	
	this.add = add;
}

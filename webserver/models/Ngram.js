var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('NGram');
	var name = 'Ngram'
		, models = _.defaults({Ngram: this}, arguments[1] || {})
		, table = 'ngrams'
		, datasource = new DatasourceMysql(db, name, table)
		;
	
	function add(memo, next){
		async.eachOfSeries(memo.data.ngrams, (ngrams, n, nextN) => {
			if(parseInt(n) > 2)return setImmediate(nextN);
			
			var normalized = {};
			_.forOwn(ngrams, (v, k) => {
				var l = k.toLowerCase();
				normalized[l] = v;
			});
			
			async.eachOfSeries(normalized, (occurances, ngram, nextNgram) => {
				if(ngram.length > 64)return setImmediate(nextNgram);
				if(ngram.indexOf('"') != -1 || ngram.indexOf("'") == -1)return setImmediate(nextNgram);
				if(ngram.indexOf('\\') != -1)return setImmediate(nextNgram);
				
				datasource.insertOrUpdate(memo.changelog_id, {
					values: {
						value: ngram,
						collection_id: memo.Collection.id,
						docs: 1
					},
					conditions: {
						value: ngram,
						collection_id: memo.Collection.id
					},
					update: {
						docs: (prev, next) => {
								return parseInt(prev.docs) + parseInt(next.docs);
							}
					}
				}, (err, insertId) => {
					if(err)return setImmediate(() => nextNgram(err));			
					setImmediate(nextNgram);
				});
			}, (err) => {
				setImmediate(() => nextN(err));
			});
		}, (err) => {
			console.log('Done ngrams');
			if(err)return setImmediate(() => next(err));
			
			setImmediate(() => next(null, memo));
		});
	}
	
	this.add = add;
	
	function docsByValue(ngrams, collectionId, callback){
		datasource.find('list', {
			fields: ['value', 'docs'],
			conditions: {
				collection_id: collectionId,
				value: ngrams
			}
		}, callback);
	}
	
	this.docsByValue = docsByValue;
}

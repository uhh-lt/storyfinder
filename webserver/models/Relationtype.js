var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('Relationtype');
	var name = 'Relationtype'
		, table = 'relationtypes'
		, datasource = new DatasourceMysql(db, name, table)
		;
		
	function find(relationtypes, callback){
		datasource.find('list', {
			fields: ['id', 'label'],
			conditions: {
				id: relationtypes,
				is_deleted: 0
			}
		}, callback);
	}
	
	this.find = find;
	
	function findByLabel(label, collectionId, callback){
		datasource.find('first', {
			fields: ['id', 'label', 'collection_id'],
			conditions: {
				label: label,
				collection_id: collectionId
			}
		}, callback);
	}
	
	this.findByLabel = findByLabel;
	
	function create(changelogId, relationtype, callback){
		datasource.insert(changelogId, {
			values: {
				label: relationtype.label,
				collection_id: relationtype.collection_id,
				is_deleted: 0
			}
		}, callback);
	}
	
	this.create = create;
}
var DatasourceMysql = require('../datasources/mysql.js')
	, async = require('async')
	, _ = require('lodash')
	;
	
module.exports = function(db){
	//console.log('Collection');
	var name = 'Collection'
		, table = 'collections'
		, datasource = new DatasourceMysql(db, name, table)
		;
	
	function findById(id, callback){
		datasource.find(_.isArray(id)?'all':'first', {
			fields: ['id', 'user_id', 'is_default', 'name', 'created', 'modified'],
			conditions: {
				id: id,
				is_deleted: 0
			},
			order: 'name ASC'
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
			
			setImmediate(() => callback(null, result));
		});
	}
	
	this.findById = findById;
		
	function getDefault(userId, callback){
		datasource.find('first', {
			fields: ['id'],
			conditions: {
				user_id: userId,
				is_default: 1,
				is_deleted: 0
			}
		}, (err, result) => {
			if(err)
				return setImmediate(() => callback(err));
						
			if(result != null)
				return setImmediate(() => callback(null, result));
			
			createDefault(userId, callback);		
		});
	}
	
	this.getDefault = getDefault;
	
	function createDefault(userId, callback){
		var date = (new Date()).toISOString().slice(0,19).replace('T',' ');
		
		db.query('INSERT INTO `collections` (user_id, is_default, name, created, modified, is_deleted) VALUES (?, 1, ?, ?, ?, 0)', [
			userId,
			'default',
			date,
			date
		], function(err, res){
			if(err)
				return setImmediate(() => {
					callback(err);
				});
				
			setImmediate(() => {
				callback(null, {
					id: res.insertId
				});
			});
		});
	}
}


var _ = require('lodash')
	, async = require('async')
	, bcrypt = require('bcrypt')
	;
	
module.exports = function(db){
	function create(data, callback){
		var date = (new Date()).toISOString().slice(0,19).replace('T',' ');
		
		bcrypt.hash(data.password, 5, function(err, hash) {
			if(err)
				return setImmediate(() => {
					callback(err);
				});
			
			data.password = hash;
			
			db.query('INSERT INTO `users` (username, password, created, modified, is_active, is_deleted) VALUES (?, ?, ?, ?, 1, 0)', [
				data.username,
				hash,
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
		});
	}
	
	this.create = create;
	
	function exists(username, callback){
		db.query('SELECT count(*) `cnt` FROM `users` WHERE username="?" LIMIT 1', [
			username
		], function(err, res){
			if(err)
				return setImmediate(() => {
					callback(err);
				});
						
			setImmediate(() => {
				callback(null, res[0]['cnt']?true:false);
			});
		});
	}
	
	this.exists = exists;
	
	function verify(username, suppliedPassword, callback){
		console.log('Verify');
		db.query('SELECT * FROM `users` WHERE username=? LIMIT 1', [username], function(err, results, fields){
			if(err)
				return setImmediate(() => {
					callback(err);
				});
						
			if(results == null || results.length == 0)
				return setImmediate(() => {
					callback(null, false);
				});
			
			var user = results[0];
			
			if(!user.is_active)
				return setImmediate(() => {
					callback(null, false);
				});
			
			bcrypt.compare(suppliedPassword, user.password, function(err, doesMatch){
				if (doesMatch){
					return setImmediate(() => {
						callback(null, true, user);
					});
				}
				
				setImmediate(() => {
					callback(null, false);
				});
			});
		});
	}
	
	this.verify = verify;
	
	function findById(id, callback){
		db.query('SELECT * FROM `users` WHERE id="?" LIMIT 1', [id], function(err, results, fields){
			if(err)
				return setImmediate(() => {
					callback(err);
				});
			
			if(results == null || results.length == 0)
				return setImmediate(() => {
					callback(null, null);
				});
			
			var user = results[0];
			
			if(!user.is_active)
				return setImmediate(() => {
					callback(null, null);
				});
				
			setImmediate(() => {
				callback(null, user);
			});
		});
	}
	
	this.findById = findById;
};
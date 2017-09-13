var _ = require('lodash')
	, async = require('async')
	;

module.exports = function(db, alias, tbl){
	function buildConditions(conditions){
		var args = [];
		
		for(var key in conditions){
			if(key.match(/^\d+$/)){
				if(_.isObject(conditions[key]))
					args.push('(' + buildConditions(conditions[key]).join(' and ') + ')');
				else
					args.push(conditions[key]);
			}else if(key == 'or'){
				args.push(buildConditions(conditions[key]).join(' or '));
			}else if(key == 'and'){
				args.push(buildConditions(conditions[key]).join(' and '));
			}else{
				var rel = '=';
				var val = conditions[key];
				if(key.indexOf(' ') != -1){
					key = key.split(' ');
					rel = key[1];
					key = key[0];
				}
				
				if(conditions[key] == null && rel == '='){
					args.push('`' + key + '` IS NULL');
				}else{					
					if(_.isArray(val)){
						val = '(' + _.map(val, function(v){
							if(isNaN(v))
								return db.escape(v); //v.replace(/\"/g,"\\\"")
							else
								return v;
						}).join(',') + ')';
						
						if(rel == '<>' || rel == '!='){
							rel = ' NOT IN ';
						}else{
							rel = ' IN ';
						}
					}else if(isNaN(val))
						val = '"' + val.replace(/\"/g,"\\\"") + '"';
						
					args.push('`' + key + '` ' + rel + ' ' + val);
				}
			}
		}
		
		return args;
	}
	
	function getDate(){
		return (new Date()).toISOString().slice(0,19).replace('T',' ');
	}
	
	this.now = getDate;
	
	function find(){
		var mode = arguments[0];
		
		var options = _.defaults(arguments[1], {
				fields: null,
				table: null,
				conditions: null,
				limit: null,
				order: null,
				group: null,
				listDepth: 1
			})
			, callback = arguments[2]
			, fields = _.map(options.fields, function(field){
				if(field.indexOf('(') != -1)
					return field;
				
				if(field.indexOf('.') == -1)
					return '`' + alias + '`.`' + field + '`';
				else
					return '`' + field + '`';
			})
			, order = ''
			, group = ''
			, where = buildConditions(options.conditions).join(' and ')
			, limit = ''
			;
		
		if(!_.isNull(options.limit)){
			if(_.isArray(options.limit)){
				options.limit = _.map(options.limit, function(l){
					if(isNaN(l))
						return 0;
					return l;
				});
				limit = ' LIMIT ' + options.limit.join(',');
			}else if(!isNaN(options.limit))
				limit = ' LIMIT ' + options.limit;
		}else if(mode == 'first')
			limit = ' LIMIT 1';
		
		if(!_.isNull(options.order)){
			if(_.isArray(options.order)){
				options.order = _.map(options.order, function(field){
					var field = field.split(' ')
						, dir = ''
						;
					
					if(field.length > 1)
						dir = ' ' + field[1];
					
					field = field[0];
					
					if(field.indexOf('.') == -1)
						return '`' + alias + '`.`' + field + '`' + dir;
					else
						return '`' + field + '`' + dir;
				});
				order = ' ORDER BY ' + options.order.join(', ');
			}else
				order = ' ORDER BY ' + options.order;
		}
		
		if(!_.isNull(options.group)){
			if(_.isArray(options.group)){
				options.group = _.map(options.group, function(field){					
					if(field.indexOf('.') == -1)
						return '`' + alias + '`.`' + field + '`';
					else
						return '`' + field + '`';
				});
				group = ' GROUP BY ' + options.group.join(', ');
			}else
				group = ' GROUP BY ' + options.group;
		}
		
		var q = 'SELECT ' + fields.join(',') + ' FROM `' + tbl + '` `' + alias + '` WHERE ' + where + group + order + limit;
		//console.log(q);
		db.query(q, function(err, results, fields){
			if(err){
				setImmediate(function(){callback(err);});
				return;
			}

			switch(mode){
				case 'first':
					if(results.length == 0)
						return setImmediate(() => callback(null, null));
					
					setImmediate(() => callback(null, results[0]));
				break;
				case 'list':
					var data = {};
					
					async.eachSeries(results, function(row, nextRow){
						var c = data;
						var depth = 0;
						for(var key of options.fields){
							if(depth + 1 == options.listDepth){
								c[row[key]] = row;
								break;
							} else {				
								if(_.isUndefined(c[row[key]]))
									c[row[key]] = {};
								c = c[row[key]];
							}
							depth++;
						}
						
						setImmediate(() => nextRow(null, data));		
					}, (err) => {
						if(err)return setImmediate(() => callback(err));
						
						setImmediate(() => callback(null, data));		
					});
				break;
				case 'deep':
					var data = [];
					async.map(results, function(data, nextRow){
						var row = {};
						for(var field of fields){
							if(_.isUndefined(row[field.table]))
								row[field.table] = {};
							row[field.table][field.name] = data[field.name];
						}
						
						setImmediate(() => {
							nextRow(null, row);
						});
					}, callback);
				break;
				default:
					setImmediate(() => callback(err, results, fields));
				break;
			}
		});
	}
	
	this.find = find;
	
	function startUpdate(userId, callback){
		db.query('INSERT INTO `changelogs` (`created`, `user_id`) VALUES (?, ?)', [getDate(), userId], (err, res) => {
			if(err)return setImmediate(() => callback(err));
			
			var id = res.insertId;
			setImmediate(() => callback(null, id));
		});
	}
	
	this.startUpdate = startUpdate;
	
	function update(/*changelogId, options, callback*/){
		var changelogId = arguments[0]
			, options = _.defaults(arguments[1], {
				values: null,
				conditions: null,
				limit: null
			})
			, callback = arguments[arguments.length - 1]
			, fields = _.keys(options.values)
			, where = buildConditions(options.conditions).join(' and ')
			, limit = ''
			;
		
		if(!_.isNull(options.limit)){
			if(_.isArray(options.limit)){
				options.limit = _.map(options.limit, function(l){
					if(isNaN(l))
						return 0;
					return l;
				});
				limit = ' LIMIT ' + options.limit.join(',');
			}else if(!isNaN(options.limit))
				limit = ' LIMIT ' + options.limit;
		}
		
		var q = 'SELECT `id`, `' + fields.join('`,`') + '` FROM `' + tbl + '` WHERE ' + where + limit;
		db.query(q, function(err, results, f){
			if(err)return setImmediate(() => callback(err));
			if(_.isNull(results))return setImmediate(() => callback(null, changelogId));

			var updates = [];
			async.eachSeries(results, (row, nextRow) => {
				var changes = {};
				for(var field of fields){
					if(row[field] != options.values[field])
						changes[field] = row[field];
				}
						
				if(!_.isEmpty(changes))
					updates.push([row.id, JSON.stringify(changes), tbl]);
				
				setImmediate(nextRow);
			}, function(err){
				if(err)return setImmediate(() => callback(err));
									
				async.each(updates, (update, nextUpdate) => {
					db.query('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelogId + ', ?, ?, ?)', update, nextUpdate);
				}, (err) => {
					if(err)return setImmediate(() => callback(err));
				
					var q = 'UPDATE `' + tbl + '` SET ' + _.keys(options.values).join('=?, ') + '=? WHERE ' + where + limit;
					//console.log(q, _.values(options.values));
				
					db.query(q, _.values(options.values), (err) => {
						if(err)return setImmediate(() => callback(err));
						setImmediate(() => callback(null, changelogId));
					});
				});
			});
		});
	}
	
	this.update = update;
	
	function insertOrUpdate(/*changelogId, options, callback*/){
		var changelogId = arguments[0]
			, options = _.defaults(arguments[1], {
				values: null,
				conditions: null,
				update: {}
			})
			, callback = arguments[arguments.length - 1]
			, fields = _.keys(options.values)
			, where = buildConditions(options.conditions).join(' and ')
			, limit = ' LIMIT 1'
			;
		
		var q = 'SELECT `id`, `' + fields.join('`,`') + '` FROM `' + tbl + '` WHERE ' + where + limit;
		db.query(q, function(err, results, f){
			if(err)return setImmediate(() => callback(err));
			if(_.isEmpty(results)){
				//Insert
				
				if(_.isUndefined(options.values.created))
					options.values.created = getDate();
				
				var c = _.values(options.values).map(() => {return '?'});
				
				var q = 'INSERT INTO `' + tbl + '` (`' + _.keys(options.values).join('`,`') + '`) VALUES (' + c.join(',') + ')';
				//console.log(q, _.values(options.values));
				//result = {insertId: Math.round(Math.random() * 100000)};
				
				db.query(q, _.values(options.values), (err, result) => {
					if(err)return setImmediate(() => callback(err));
					
					var insertId = result.insertId;
					
					db.query('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelogId + ', ?, ?, ?)', [
						insertId,
						JSON.stringify(options.values),
						tbl
					], (err) => {
						if(err)return setImmediate(() => callback(err));
						
						setImmediate(() => callback(null, insertId));
					});				
				});
			}else{
				//Update
				
				var id = null;
				var updates = [];
				async.eachSeries(results, (row, nextRow) => {
					var changes = {};
					
					for(var key in options.update) //Run update functions
						row[key] = options.update[key](row, options.values);
					
					for(var field of fields){
						if(row[field] != options.values[field])
							changes[field] = row[field];
					}
							
					if(!_.isEmpty(changes))
						updates.push([row.id, JSON.stringify(changes), tbl]);
					
					id = row.id;
					
					setImmediate(nextRow);
				}, function(err){
					if(err)return setImmediate(() => callback(err));
										
					async.each(updates, (update, nextUpdate) => {
						db.query('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelogId + ', ?, ?, ?)', update, nextUpdate);
					}, (err) => {
						if(err)return setImmediate(() => callback(err));
					
						var q = 'UPDATE `' + tbl + '` SET ' + _.keys(options.values).join('=?, ') + '=? WHERE ' + where + limit;
						//console.log(q, _.values(options.values), updates[0][0]);
					
						//setImmediate(() => callback(null, updates[0].id));
						db.query(q, _.values(options.values), (err) => {
							if(err)return setImmediate(() => callback(err));
							setImmediate(() => callback(null, id));
						});
					});
				});
			}
		});
	}
	
	this.insertOrUpdate = insertOrUpdate;
	
	function insert(/*changelogId, options, callback*/){
		var changelogId = arguments[0]
			, options = _.defaults(arguments[1], {
				values: null
			})
			, callback = arguments[arguments.length - 1]
			, fields = _.keys(options.values)
			;
		
		//Insert
		if(_.isUndefined(options.values.created))
			options.values.created = getDate();
		
		var c = _.values(options.values).map(() => {return '?'});
		
		var q = 'INSERT INTO `' + tbl + '` (`' + _.keys(options.values).join('`,`') + '`) VALUES (' + c.join(',') + ')';
		//console.log(q, _.values(options.values));
		//result = {insertId: Math.round(Math.random() * 100000)};
		
		
		db.query(q, _.values(options.values), (err, result) => {
			if(err)return setImmediate(() => callback(err));
			
			var insertId = result.insertId;
			
			db.query('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelogId + ', ?, ?, ?)', [
				insertId,
				JSON.stringify(options.values),
				tbl
			], (err) => {
				if(err)return setImmediate(() => callback(err));
				
				setImmediate(() => callback(null, insertId));
			});				
		});
	}
	
	this.insert = insert;
};
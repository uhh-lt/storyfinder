var _ = require('lodash')
	, async = require('async')
	;

function buildConditions(conditions){
	var args = [];
	
	for(var key in conditions){
		if(key.match(/^\d+$/)){
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
				//console.log(typeof val);
				
				if(_.isArray(val)){
					val = '("' + _.map(val, function(v){
						if(isNaN(v))
							return v.replace(/\"/g,"\\\"")
						else
							return v;
					}).join('","') + '")';
					
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

module.exports.update = function update(connection, userId){
	var date = (new Date()).toISOString().slice(0,19).replace('T',' ')
		;
	
	var options = _.defaults(arguments[2], {
		values: null,
		table: null,
		conditions: null,
		limit: null
	});
	
	var callback = arguments[3]
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
	
	var q = 'SELECT `id`, `' + fields.join('`,`') + '` FROM `' + options.table + '` WHERE ' + where + limit;
	//console.log(q);
	connection.query(q, function(err, results, f){
		if(err){
			setImmediate(function(){callback(err);});
			return;
		}
				
		if(!_.isNull(results)){
			var updates = [];
			
			async.eachSeries(results, function(row, nextRow){
				var changes = {};
				for(var i = 0;i < fields.length; i++){
					if(row[fields[i]] != options.values[fields[i]]){
						changes[fields[i]] = row[fields[i]];
					}
				}
								
				if(!_.isEmpty(changes)){
					updates.push([row.id, JSON.stringify(changes), options.table]);
				}
				
				setImmediate(nextRow);
			}, function(err){
				if(err){
					callback(err);
					return;
				}
				
				q = 'INSERT INTO changelogs (`created`, `user_id`) VALUES (?, ?)';
				//console.log(q);
				connection.query(q, [date, userId], function(err, result){
					if(err){
						callback(err);
						return;
					}
					
					var changelog_id = result.insertId;
					
					async.each(updates, function(update, nextUpdate){
						//console.log('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelog_id + ', ?, ?, ?)');
						connection.query('INSERT INTO changelogs_updates (`changelog_id`, `foreign_id`, `vals`, `tbl`) VALUES (' + changelog_id + ', ?, ?, ?)', update, nextUpdate);
					}, function(err){
						if(err){
							callback(err);
							return;
						}
						
						//console.log('UPDATE `' + options.table + '` SET ' + _.keys(options.values).join('=?, ') + '=? WHERE ' + where + limit);
						
						connection.query('UPDATE `' + options.table + '` SET ' + _.keys(options.values).join('=?, ') + '=? WHERE ' + where + limit, _.values(options.values), function(err){
							if(err){
								callback(err);
								return;
							}
						
							
							setImmediate(function(){
								callback(null, changelog_id);
							});
						});
					});
				});
			});
		}else{
			console.log('RESULT IS NULL!!!', q);
		}
	});
}
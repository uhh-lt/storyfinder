var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	;
	
module.exports = function(connection, app, passport){
	var User = new (require('../models/User.js'))(connection)
		;
		
	/*
	Register	
	*/	
	app.put('/Users', function(req, res){
		if(_.isEmpty(req.body) || _.isEmpty(req.body.username) || _.isEmpty(req.body.password)){
			return setImmediate(() => {
				res.sendStatus(400);
			});
			
			return;
		}
		
		User.exists(req.body.username, (err, exists) => {
			if(err){
				console.log(err);
				return setImmediate(() => {
					res.sendStatus(500);
				});
			}
						
			if(exists)
				return setImmediate(() => {
					res.send({
						success: false,
						message: 'An account for the given Email address exists already!'
					});
				});
			
			User.create(req.body, (err, user) => {
				if(err){
					console.log(err);
					return setImmediate(() => {
						res.sendStatus(500);
					});
				}
				
				var userId = user.id;
				
				User.findById(userId, (err, user) => {
					if(err){
						console.log(err);
						return setImmediate(() => {
							res.sendStatus(500);
						});
					}
					
					
					req.login(user, function(err) {
						if(err){
							console.log(err);
							return setImmediate(() => {
								res.sendStatus(500);
							});
						}
						
						res.send({
							success: true,
							id: userId
						});
					});
				});
			});
		});
	});
	
	/*
	Show registration form	
	*/
	app.get('/register', function (req, res) {
		fs.readFile(__dirname + '/../public/css/bootstrap.css', function(err, style){
			if(err){
				console.log(err);
				return;
			}
			fs.readFile(__dirname + '/../public/register.html', function(err, html){
				if(err){
					console.log(err);
					return;
				}
				res.send(html.toString().replace(/\{\{style\}\}/, style.toString()));
			});
		});
	});
	
	/*
	Show login form	
	*/
	app.get('/login', function (req, res) {
		fs.readFile(__dirname + '/../public/css/bootstrap.css', function(err, style){
			if(err){
				console.log(err);
				return;
			}
			fs.readFile(__dirname + '/../public/login.html', function(err, html){
				if(err){
					console.log(err);
					return;
				}
				res.send(html.toString().replace(/\{\{style\}\}/, style.toString()));
			});
		});
	});
	
	/*
	Login	
	*/
	app.post('/login', passport.authenticate('local', { successRedirect: (process.env.PATH_PREFIX || '/') + 'Users/status', failureRedirect: (process.env.PATH_PREFIX || '/') + 'login' }));
	
	/*
	Return login status
	*/
	app.get('/Users/status', function (req, res, next) {
		console.log(req.isAuthenticated());
		if (!req.isAuthenticated || !req.isAuthenticated()) {
			passport.authenticate('basic', {session: true})(req, res, next);
		}else{
			next();
		}
	}, function(req, res){
		res.send({
			success: true
		});
	});
	
	/*
	Logout
	*/
	app.get('/logout', function(req, res){
		req.logout();
		res.redirect((process.env.PATH_PREFIX || '/'));
	});
};

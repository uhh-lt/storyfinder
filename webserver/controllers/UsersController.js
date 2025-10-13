var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, createLogger = require('../utils/logger')
	;

const logger = createLogger('UsersController');

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

		User.exists(req.body.username, (err, userexists) => {
			if(err){
				logger.error('User.exists lookup failed', err);
				return setImmediate(() => {
					res.sendStatus(500);
				});
			}

			if(userexists)
				return setImmediate(() => {
					res.send({
						success: false,
						message: 'An account for the given Email address exists already!'
					});
				});
			logger.debug('User exists lookup', userexists);

			User.create(req.body, (err, user) => {
				if(err){
					logger.error('User.create failed', err);
					return setImmediate(() => {
						res.sendStatus(500);
					});
				}

				var userId = user.id;

				User.findById(userId, (err, user) => {
					if(err){
						logger.error('User.findById failed', err);
						return setImmediate(() => {
							res.sendStatus(500);
						});
					}


					req.login(user, function(err) {
						if(err){
							logger.error('req.login failed', err);
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
	Login
	*/

	app.post('/login',
		passport.authenticate('local', { successRedirect: (process.env.PATH_PREFIX || '/') + 'Users/status', failureRedirect: (process.env.PATH_PREFIX || '/') + 'error404' }));

	/*
	Return login status
	*/
	app.get('/Users/status', function (req, res, next) {
		logger.debug('Auth status', req.isAuthenticated());
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
};






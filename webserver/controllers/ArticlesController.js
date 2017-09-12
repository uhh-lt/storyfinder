var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, path = require('path')
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, evallog = new (require('../libs/evallog.js'))()
	;
	
module.exports = function(connection, app, passport){
	var User = new (require('../models/User.js'))(connection)
		, Site = new (require('../models/Site.js'))(connection)
		, Article = new (require('../models/Article.js'))(connection)
		, Collection = new (require('../models/Collection.js'))(connection)
		;
		
	app.get('/Articles/:articleId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id
			, articleId = req.params.articleId
			;
			
		evallog.log('Open article ' + articleId);
			
		async.waterfall([
			(next) => setImmediate(() => next(null, {article_id: articleId})),
			/*
			Get the article
			*/
			(memo, next) => {
				Article.findById(memo.article_id,
					(err, article) => {
						if(err)return setImmediate(() => next(err));
						memo.Article = article;
						setImmediate(() => next(null, memo));
					}
				);
			},
			/*
			Get the site containing the article
			*/
			(memo, next) => {
				Site.findById(memo.Article.site_id, 
					(err, site) => {
						if(err)return setImmediate(() => next(err));
						memo.Site = site;
						setImmediate(() => next(null, memo));
					}
				);
			},
			/*
			Verify that the site belongs to one of the user's collection
			*/
			(memo, next) => {
				Collection.findById(memo.Site.collection_id, 
					(err, collection) => {
						if(err)return setImmediate(() => next(err));
						
						if(collection.user_id != userId)
							memo = null;
						
						setImmediate(() => next(null, memo));
					}
				);
			}
		], 
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			if(_.isNull(result))
				res.sendStatus(404);
			else
				res.render('Articles/get', result);
		});
	});
	
	app.put('/Articles/:articleId/image', passport.authenticate('basic', {session: false}), function(req, res){
		var userId = req.user.id
			, articleId = req.params.articleId
			, img = req.body.image.replace(/^data:image\/png;base64,/, "")
			;
		
		async.waterfall([
			(next) => setImmediate(() => next(null, {
				user_id: userId			
			})),
			_mGetCollection, //Get the id of user's default collection
			(memo, next) => {
				async.reduce(['..', 'public', 'images', '/' + memo.Collection.id, 'articles'], __dirname, (p, folder, nextFolder) => {
					p = path.join(p, folder);
					
					fs.stat(p, (err, stats) => {
						if(err && err.code == 'ENOENT') {
							fs.mkdir(p, (err) => {
								if(err)return setImmediate(() => nextFolder(err));
								
								setImmediate(() => nextFolder(null, p));
							});
						}else if(err){
							return setImmediate(() => nextFolder(err));
						}else{
							return setImmediate(() => nextFolder(null, p));
						}
					});
				}, (err, p) => {
					if(err)return setImmediate(() => next(err));
					
					memo.path = p;
					setImmediate(() => next(null, memo));
				});
			},
			(memo, next) => {
				fs.writeFile(path.join(memo.path, articleId + '.png'), img, 'base64', function(err){
					if(err)return setImmediate(() => next(err));
					
					setImmediate(() => next(null, memo));
				});
			}
		], 
		(err, result) => {
			if(err){
				console.log(err);
				res.sendStatus(500);
				return false;
			}
			
			res.send({
				success: true
			});
		});
	});
	
	/*
		Memo functions	
	*/
		/*
		Get the id of user's default collection	
		*/
		function _mGetCollection(memo, next){
			Collection.getDefault(memo.user_id, 
				(err, collection) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Collection = collection;
					
					setImmediate(() => next(null, memo))
				}
			);
		}
}
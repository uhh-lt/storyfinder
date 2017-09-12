var _ = require('lodash')
	, async = require('async')
	, fs = require('fs')
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, evallog = new (require('../libs/evallog.js'))()
	;
	
module.exports = function(connection, app, passport){
	var User = new (require('../models/User.js'))(connection)
		, Site = new (require('../models/Site.js'))(connection)
		, Article = new (require('../models/Article.js'))(connection)
		, Collection = new (require('../models/Collection.js'))(connection)
		, Entity = new (require('../models/Entity.js'))(connection)
		, Relation = new (require('../models/Relation.js'))(connection)
		;
	
	app.get('/Graphs', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id

		async.waterfall([
			(next) => {
				setImmediate(() => next(null, {user_id: userId}))
			},
			_mGetCollection, //Get the id of user's default collection	
			_mGetEntities, //Get the entities in the collection
			_mGetRelations //Get the relations of the entities
		], 
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	app.get('/Graphs/Site/:siteId', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id
			, siteId = parseInt(req.params.siteId)
			;
			
		evallog.log('Open graph ' + req.params.siteId);

		async.waterfall([
			(next) => {
				setImmediate(() => next(null, {user_id: userId, site_id: siteId}))
			},
			_mGetCollection, //Get the id of user's default collection
			_mGetSites, //Get Site(s)
			_mGetArticles, //Get newest Article
			_mGetEntities, //Get all entities for the site(s)
			_mGetRelations //Get the relations of the entities
		], 
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	app.get('/Graphs/Group/:siteIds', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
		var userId = req.user.id
			, siteIds = _.map(req.params.siteIds.split(';'), siteId => parseInt(siteId))
			;

		evallog.log('Open group ' + siteIds.join(';'));

		async.waterfall([
			(next) => {
				setImmediate(() => next(null, {user_id: userId, site_ids: siteIds}))
			},
			_mGetCollection, //Get the id of user's default collection
			_mGetSites, //Get Site(s)
			_mGetArticles, //Get newest Article
			_mGetEntities, //Get all entities for the site(s)
			_mGetRelations //Get the relations of the entities
		], 
		(err, result) => {
			if(err){
				console.log(err);
				return setImmediate(() => res.sendStatus(500));
			}
			
			res.send(result);
		});
	});
	
	/*
		Memo functions:
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
		
		/*
		Get the entities in the collection	
		*/
		function _mGetEntities(memo, next){
			var method = 'getAll'
				, param = memo.Collection.id
				;
			
			if(!_.isEmpty(memo.Articles)){
				method = 'getInArticle';
				param = _.map(memo.Articles, 'id');
			}else if(!_.isEmpty(memo.Article)){
				method = 'getInArticle';
				param = memo.Article.id;
			}
				
			Entity[method](param, 
				(err, entities) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Entities = entities;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
		
		/*
		Get the relations of the entities
		*/
		function _mGetRelations(memo, next){
			Relation.getByEntities(_.map(memo.Entities, 'id'),
				{withTypes: true}, 
				(err, relations) => {
					if(err)return setImmediate(() => next(err));
					
					memo.Relations = relations;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
		
		/*
		Get Site(s)	
		*/
		function _mGetSites(memo, next){
			var multi = false;
			if(!_.isUndefined(memo.site_ids))
				multi = true;
			
			Site.getById(memo[multi?'site_ids':'site_id'], memo.Collection.id,
				(err, site) => {
					if(err)return setImmediate(() => next(err));
					
					memo[multi?'Sites':'Site'] = site;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
		
		/*
		Get newest articles of the sites
		*/
		function _mGetArticles(memo, next){
			if(_.isEmpty(memo.Site) && _.isEmpty(memo.Sites))return setImmediate(() => next(null, memo));
			
			var multi = false;
			if(!_.isUndefined(memo.Sites))
				multi = true;
			
			Article.getLatest(multi?_.map(memo.Sites, 'id'):memo.Site.id,
				(err, article) => {
					if(err)return setImmediate(() => next(err));
					
					memo[multi?'Articles':'Article'] = article;
					
					setImmediate(() => next(null, memo));
				}
			);
		}
}
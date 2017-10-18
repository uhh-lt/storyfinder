var express = require('express')
	, app = express()
	, http = require('http').Server(app)
	, io = require('socket.io')(http)
	, bodyParser = require('body-parser')
	, cookieSession = require('cookie-session')
	, methodOverride = require('method-override')
	, serveStatic = require('serve-static')
	, port = 3055
	, mysql = require('mysql')
	, connection = mysql.createConnection({
		host     : process.env.MYSQL_HOST || "mysql",
		port	 : process.env.MYSQL_PORT || 3306,
		user     : process.env.MYSQL_USER || 'storyfinder',
		password : process.env.MYSQL_PASSWORD || 'storyfinder',
		database : process.env.MYSQL_DATABASE || 'storyfinder',
		charset: "utf8_general_ci"
	})
	, fs = require('fs')
	, handleVisit = require('./libs/handle_visit.js')
	, async = require('async')
	, _ = require('lodash')
	, passport = require('passport')
	, BasicStrategy = require('passport-http').BasicStrategy
	, LocalStrategy = require('passport-local').Strategy
	, User = new (require('./models/User.js'))(connection)
	, ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
	, exphbs  = require('express-handlebars')
	, tables = {'articles': true,'articles_entities': true,'articles_tokens': true,'changelogs': true,'changelogs_updates': true,'collections': true,'entities': true,'entities_sentences': true,'log_entities': true,'ngrams': true,'relations': true,'relations_sentences': true,'relationtypes': true,'sentences': true,'sites': true,'tokens': true,'users': true,'visits': true}
	;

function startServer(){
	http.listen(port, function () {
		console.log('Storyfinder listening on port ' + port);
	});
}

/*
Initialise database.
*/
connection.query('SHOW TABLES', (err, result, fields) => {
	if(err){
		throw err;
		return;
	}
	
	var fieldName = fields[0].name;
	
	for(var row of result) {
		var tbl = row[fieldName];
		
		if(typeof tables[tbl] !== 'undefined')
			delete tables[tbl];
	}
	
	if(!_.isEmpty(tables)){
		console.log('Some database tables are missing. Creating tables ' + _.keys(tables).join("\n"));
		fs.readFile('./data/sql/schema.sql', (err, content) => {
			if(err){
				throw err;
				return;
			}
			
			var queries = content.toString().split("\n\n");
			
			async.each(queries, (query, nextQuery) => {
				connection.query(query, nextQuery);
			}, startServer);
		});
	}else{	
		setImmediate(startServer);
	}
});

/*
Authentication	
*/
passport.use(new BasicStrategy(
	function(username, password, done){
		User.verify(username, password, function(err, isValid, user){
			if (err) { return done(err); }
			if (!isValid) {
				return done(null, false, { message: 'Incorrect username or password.' });
			}
			return done(null, user);
		});
	}
));

passport.use(new LocalStrategy(
	function(username, password, done){
		User.verify(username, password, function(err, isValid, user){
			if (err) {
				console.log('Passport ERROR');
				return done(err);
			}
			if (!isValid) {
				console.log('Passport Incorrect username or password');
				return done(null, false, { message: 'Incorrect username or password.' });
			}
			console.log('Passport success!');
			return done(null, user);
		});
	}
));

passport.serializeUser(function(user, done) {
	if(user == null)
		done(null, null);
	else
		done(null, user.id);
});

passport.deserializeUser(function(id, done) {
	User.findById(id, function(err, user) {
		console.log('User deserialized');
		done(err, user);
	});
});

function loggedInHTTP(req, res, next){
	if (!req.isAuthenticated || !req.isAuthenticated()) {
		passport.authenticate('basic', {session: true})(req, res, next);
	}else{
		next();
	}
}

// parse application/json
app.use(bodyParser.json({limit: '50mb'}))
app.use(bodyParser.urlencoded({ extended: false }))

app.use(cookieSession({secret: process.env.COOKIE_SECRET}));

//MethodOverride
app.use(methodOverride('X-HTTP-Method-Override'))
app.use(methodOverride('_method'))

//Serve static files
app.use(serveStatic(__dirname + '/public'))
app.use(passport.initialize());
app.use(passport.session());

var hbs = exphbs.create({
    // Specify helpers which are only registered on this instance.
    helpers: {
        style: function () { return fs.readFileSync(__dirname + '/public/css/bootstrap.css').toString(); }
    },
    defaultLayout: 'main'
});

app.engine('handlebars', hbs.engine);

app.set('view engine', 'handlebars');

var UsersController = new (require('./controllers/UsersController.js'))(connection, app, passport)
	, GraphsController = new (require('./controllers/GraphsController.js'))(connection, app, passport)
	, SitesController = new (require('./controllers/SitesController.js'))(connection, app, passport, io)
	, EntitiesController = new (require('./controllers/EntitiesController.js'))(connection, app, passport, io)
	, ArticlesController = new (require('./controllers/ArticlesController.js'))(connection, app, passport)
	, RelationsController = new (require('./controllers/RelationsController.js'))(connection, app, passport)
	;
 
app.get('/', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
	fs.readFile(__dirname + '/public/css/bootstrap.css', function(err, style){
		if(err){
			console.log(err);
			return;
		}
		fs.readFile(__dirname + '/public/_index.html', function(err, html){
			if(err){
				console.log(err);
				return;
			}
			res.send(html.toString().replace(/\{\{style\}\}/, style.toString()));
		});
	});
});

app.get('/reseteval', function (req, res) {
	var t = ['articles',
		'articles_entities',
		'articles_tokens',
		'changelogs',
		'changelogs_updates',
		'entities',
		'entities_sentences',
		'log_entities',
		'ngrams',
		'relations',
		'relations_sentences',
		'relationtypes',
		'sentences',
		'sites',
		'tokens'];

	for(var i = 0;i < t.length; i++)
		connection.query('TRUNCATE ' + t[i]);
		
	res.send('ok');
});

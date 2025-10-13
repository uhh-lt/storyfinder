// Load environment from project root .env (if present)
try {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {}

var express = require('express')
	, app = express()
	, http = require('http').Server(app)
	, io = require('socket.io')(http)
	, bodyParser = require('body-parser')
    , path = require('path')
	, cookieSession = require('cookie-session')
	, methodOverride = require('method-override')
	, serveStatic = require('serve-static')
	, createLogger = require('./utils/logger')
	, port = 3055
	, mysql = require('mysql')
	, connection = mysql.createConnection({
		host     : process.env.MYSQL_HOST || "mysql" /*'127.0.0.1'*/,
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
	, tables = {'articles': true,'articles_entities': true,'articles_tokens': true,'changelogs': true,'changelogs_updates': true, 'chat_messages': true, 'chat_sessions': true, 'collections': true,'entities': true,'entities_sentences': true,'log_entities': true,'ngrams': true,'relations': true,'relations_sentences': true,'relationtypes': true,'sentences': true,'sites': true, 'summaries': true, 'tokens': true,'users': true,'visits': true}
	;

const logger = createLogger('server');

function startServer(){
	http.listen(port, function () {
		logger.info('Storyfinder listening on port ' + port);
	});
}

/* Write CHROME_ID to file (safe if file exists in either new or legacy tree) */
const candidateFiles = [
  path.join(__dirname, "public", "js", "storyfinder.js")
];

candidateFiles.forEach(fp => {
  try {
    if (fs.existsSync(fp)) {
      const data = fs.readFileSync(fp, "utf8");
      const result = data.replace(/INSERT_CHROME_PLUGIN_ID_HERE/g, process.env.CHROME_ID || "");
      fs.writeFileSync(fp, result, "utf8");
      logger.debug('chrome id patched', { file: fp });
    }
  } catch (e) {
    logger.warn('chrome id patch skipped', { file: fp, reason: e?.message || e });
  }
});

/*
 Initialize database: check for missing tables and create them
*/
connection.query('SHOW TABLES', (err, result, fields) => {
  if (err) throw err;

  // Remove existing tables from the tables object
  const fieldName = fields[0].name;
  for (const row of result) {
    const tbl = row[fieldName];
    if (tables[tbl] !== undefined) {
      delete tables[tbl];
    }
  }

  if (!_.isEmpty(tables)) {
    logger.warn('missing database tables detected', { tables: Object.keys(tables) });

    // 1) Read the schema and split by semicolon + newline
    const file = fs.readFileSync('./data/sql/schema.sql', 'utf8');
    const queries = file
      .split(/;\s*[\r\n]+/)      // split after each ';' followed by a line break
      .map(q => q.trim())        // trim whitespace
      .filter(q => q.length > 0) // remove empty strings
      .map(q => q + ';');        // add the semicolon back

    // 2) Execute each query, log errors, but don't abort
    async.each(
      queries,
      (query, next) => {
        connection.query(query, err => {
          if (err) {
            logger.error(
              'Error in SQL statement:',
              err.code,
              err.sqlMessage,
              '\n>>',
              query
            );
          }
          next();
        });
      },
      () => {
        // After all queries, start the server
        startServer();
      }
    );
  } else {
    // All tables exist, start immediately
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
				logger.error('Passport ERROR');
				return done(err);
			}
			if (!isValid) {
				logger.warn('Passport incorrect username or password');
				return done(null, false, { message: 'Incorrect username or password.' });
			}
			logger.debug('Passport success!');
			return done(null, user);
		});
	}
));

passport.serializeUser(function(user, done) {
	logger.debug('Passport serialize user', user ? user.id : null);
	if(user == null)
		done(null, null);
	else
		done(null, user.id);
});

passport.deserializeUser(function(id, done) {
	User.findById(id, function(err, user) {
		logger.debug('User deserialized');
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
// HTTP duration logger for slow requests and errors
const SLOW_MS = Number(process.env.LOG_HTTP_SLOW_MS || 0);
if (SLOW_MS > 0) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        if (ms > SLOW_MS || res.statusCode >= 400) {
          logger.info('[HTTP]', { method: req.method, url: req.originalUrl || req.url, status: res.statusCode, ms: Math.round(ms) });
        }
      } catch (_) {}
    });
    next();
  });
}
app.use(cookieSession({
  name: 'sf_sess',                        // give the cookie a known name
  secret: process.env.COOKIE_SECRET || 'dev-secret',
  maxAge: 24 * 60 * 60 * 1000 * 365,
  httpOnly: true,
  sameSite: 'lax',
  secure: !!process.env.COOKIE_SECURE     // set to true behind https/proxy
}));

//MethodOverride
app.use(methodOverride('X-HTTP-Method-Override'))
app.use(methodOverride('_method'))

//Serve static files
app.use(serveStatic(__dirname + '/public'))

// Serve the copied graph app under /graph (neutral naming)
app.use('/graph', express.static(path.join(__dirname, 'public', 'graph')));

// HTML entry for /graph (embed shell; loads local assets from ./css, ./js)
app.get('/graph', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'graph', 'index.html'));
});

app.use(passport.initialize());
app.use(passport.session());


/**
 * authAny: allow requests authenticated either by an existing cookie-session
 * (req.user already set by passport.session()) OR by Basic Auth header.
 * This keeps legacy SW flows (Basic) working while enabling modern tab flows (cookies).
 */
function authAny(req, res, next) {
  // If a cookie-session already populated req.user, accept it.
  if (req.user) return next();
  // Otherwise, try Basic without creating an express-session.
  return passport.authenticate('basic', { session: false })(req, res, next);
}


// --- AUTH API: status & logout ---
app.get('/api/me', (req, res) => {
  try {
    if (req.user) {
      // passe Felder bei Bedarf an dein User-Modell an
      const user = {
        id: req.user.id,
        name: req.user.name || req.user.username || 'user',
        email: req.user.email || null,
        roles: req.user.roles || []  // optional
      };
      return res.json({ auth: true, user });
    }
    return res.json({ auth: false, user: null });
  } catch (e) {
    logger.error('[api/me] error:', e);
    return res.status(500).json({ auth: false, error: 'me_failed' });
  }
});

function performLogout(req, res) {
  const finish = () => {
    try { req.session = null; } catch {}
    try { res.clearCookie('sf_sess'); } catch {}
    return res.json({ ok: true });
  };

  try {
    // Passport < 0.6 -> req.logout.length === 0 (no callback)
    // Passport >= 0.6 -> req.logout.length === 1 (accepts callback)
    if (typeof req.logout === 'function') {
      if (req.logout.length === 0) {
        // old signature
        req.logout();
        finish();
      } else {
        // new signature with callback
        req.logout(() => finish());
      }
    } else {
      // very old/custom: no function -> just finish
      finish();
    }
  } catch (e) {
    logger.error('[logout] error:', e);
    // even on error, force session clear so the client isn't stuck
    try { req.session = null; } catch {}
    try { res.clearCookie('sf_sess'); } catch {}
    res.status(500).json({ ok: false, error: 'logout_failed' });
  }
}


// API logout (preferred)
app.post('/api/logout', performLogout);

// Legacy GET logout (fallback for old UI/links)
app.get('/logout', performLogout);

// --- /AUTH API ---

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
	, SummarizeController = new (require('./controllers/SummarizeController.js'))(connection, app, passport, io)
	, ChatController      = new (require('./controllers/ChatController.js'))(connection, app, passport, io)
  ;
 
/*
app.get('/', ensureLoggedIn((process.env.PATH_PREFIX || '/') + 'login'), function (req, res) {
	fs.readFile(__dirname + '/public/css/bootstrap.css', function(err, style){
		if(err){
			logger.error(err);
			return;
		}
		fs.readFile(__dirname + '/public/_index.html', function(err, html){
			if(err){
				logger.error(err);
				return;
			}
			res.send(html.toString().replace(/\{\{style\}\}/, style.toString()));
		});
	});
});
*/

// Lightweight ping endpoint (auth-agnostic for now)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// New modern app entry (no auth gate for now)
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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









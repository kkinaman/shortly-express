var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var crypto = require('crypto');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({secret: '2421948719284HIIII', cookie: {}}));

var checkUser = function(req, res, next) {
  if (!req.session.username) {
    res.redirect('/login');
  } else {
    next();
  }
};

app.get('/', checkUser,
function(req, res) {
  res.render('index');
});

app.post('/', function(req, res) {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
});


app.get('/links', checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  }); 
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
var hashPassword = function(pword) {
  var shasum = crypto.createHash('sha1');
  shasum.update(pword);
  return shasum.digest('hex'); 
};

var makeRandomString = function(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  var user = req.body.username;
  db.knex('users')
    .where('username', '=', user)
    .then(function(results) {
      if (results[0]) {
        if (results[0]['password'] === hashPassword(results[0].salt + req.body.password)) {
          req.session.username = user;
          res.redirect('/');
        } else {
          //show message to user that username/password invalid
          // document.getElementsByClassName('invalid_login').show();
          res.redirect('/login');
        }
      } else {
        res.redirect('/login');
      }
    }).catch(function(err) {
      console.log(err);
    });

  
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  var salt = makeRandomString(10);
  new User({
    'username': req.body.username,
    'password': hashPassword(salt + req.body.password),
    'salt': salt
  }).save().then(function() {
    req.session.username = req.body.username;
    res.redirect('/');
  });
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);

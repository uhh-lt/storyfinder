# build the server

## prepare

```
$ npm install -g watchify

$ cd /storyfinder/webserver
$ npm install

$ cd /storyfinder/webserver/public/js
$ npm install
```

## Build storyfinder.js

```
$ cd /storyfinder/webserver/public/js
$ watchify index.js -t babelify -t [hbsfy -t] -o storyfinder.js
```

## Build register.js

```
$ cd /storyfinder/webserver/public/js
$ watchify register/register.js -t babelify -t [hbsfy -t] -o register.js
```

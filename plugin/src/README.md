## Build the contentscript

```
$ cd /js-contentscript
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../contentscript.js
```

## Build the pageworker

```
$ cd /js-backgroundscript
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../backgroundscript.js
```

## Build the contentstyle

```
$ cd /js-contentstyle
$ npm install
$ grunt less
```
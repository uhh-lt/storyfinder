## Build the contentscript

```
$ cd /js-contentscript
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../background_scripts/contentscript.js
```

## Build the pageworker

```
$ cd /js-pageworker
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../background_scripts/pageworker.js
```
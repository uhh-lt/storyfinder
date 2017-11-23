# prepare

```
$ cd /storyfinder/plugin
$ npm install
```

# build the plugin

## Build the contentscript

```
$ cd /storyfinder/plugin/src/js-contentscript
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../contentscript.js
```

## Build the pageworker

```
$ cd /storyfinder/plugin/src/js-backgroundscript
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../backgroundscript.js
```

## Build the contentstyle

```
$ cd /storyfinder/plugin/src/js-contentstyle
$ npm install
$ grunt less
```

# update plugin

## increase version number

```
$ cd /storyfinder/plugin/src/
```
edit the "version" field in manifest.json

## filter the important files

```
$ cd /storyfinder/plugin
$ npm run copy
```

## pack extension

### via command line with chrome

```
$ chrome.exe --pack-extension=/storyfinder/plugin/dist --pack-extension-key=path/to/storyfinder-plugin.pem
```

### via command line with crx node module

```
$ crx pack storyfinder\plugin\dist -o storyfinder\release\storyfinder.crx -p storyfinder\release\storyfinder-plugin.pem
```

### via chrome
1. navigate to chrome://extensions/
2. click pack extension
3. provide /storyfinder/plugin/dist as the path to the extension
   provide /path/to/storyfinder-plugin.pem as the path to the private key
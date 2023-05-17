# Recommended workflow

0. provide the private key under /storyfinder/release/storyfinder-plugin.pem
1. make changes to the code
2. increase version number in /storyfinder/src/manifest.json
3. automatically build the plugin with npm run build
4. automatically publish the plugin with npm run publish
5. upload the generated zip file /storyfinder/release/storyfinder.zip to the google developer console

# Build the plugin

## Automatic build
this will automatically build the files: serive_worker.js, content_script.js, content_style.css

```
$ cd /storyfinder/plugin
$ npm run build
```

## Manual build

### Build the content_script

```
$ cd /storyfinder/plugin/src/js-content_script
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../content_script.js
```

### Build the backgroundscript

```
$ cd /storyfinder/plugin/src/js-service_worker
$ npm install
$ browserify index.js -t babelify -t [hbsfy -t] -o ../service_worker.js
```

### Build the contentstyle

```
$ cd /storyfinder/plugin/src/js-content_style
$ npm install
$ grunt less
```

# Publish the plugin

## Automatic publish
this will automatically create storyfinder.crx and storyfinder.zip in /storyfinder/release

```
$ cd /storyfinder/plugin
$ npm run publish
```

## Manual publish

### via command line with chrome

```
$ chrome.exe --pack-extension=/storyfinder/plugin/src --pack-extension-key=path/to/storyfinder-plugin.pem
```

### via chrome
1. navigate to chrome://extensions/
2. click pack extension
3. provide /storyfinder/plugin/src as the path to the extension
   provide /path/to/storyfinder-plugin.pem as the path to the private key
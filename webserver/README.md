# Server

## Instructions
1. Create dockers
2. Attach to docker
3. Build server
4. npm start

## Docker

### Choose docker-compose file:
docker-compose-dev: Development Version, uses CHROME_ID = pebdjeaapfkjiceloeecpoedbliefnap
docker-compose: Live Version, uses CHROME_ID = hnndfanecdfnonofigcceaahflgfpgbd

### Create dockers

```
$ cd storyfinder/webserver/docker
$ docker-compose -f docker-compose-dev.yml -p storyfinder up -d
```

### Attach docker

```
$ docker attach storyfinder_webserver-dev_1
```

### Delete dockers

```
$ cd storyfinder/webserver/docker
$ docker-compose -f docker-compose-dev.yml -p storyfinder down
```

## Automatically build server
this installs the npm modules and builds storyfinder.js and register.js

```
$ cd storyfinder/webserver
$ npm run build
```

## Manually install npm modules

```
$ npm install -g watchify

$ cd /storyfinder/webserver
$ npm install

$ cd /storyfinder/webserver/public/js
$ npm install
```

## Manually build storyfinder.js

```
$ cd /storyfinder/webserver/public/js
$ watchify index.js -t babelify -t [hbsfy -t] -o storyfinder.js
```

## Manually build register.js

```
$ cd /storyfinder/webserver/public/js
$ watchify register/register.js -t babelify -t [hbsfy -t] -o register.js
```

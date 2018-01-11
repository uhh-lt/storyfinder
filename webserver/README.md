# Instructions to start the server

1. Create dockers
2. Attach to docker
4. npm start

# Docker

### Choose docker-compose file:
docker-compose-dev: Development Version, uses CHROME_ID = pebdjeaapfkjiceloeecpoedbliefnap

docker-compose: Live Version, uses CHROME_ID = ilpnhljlghnglopiokcbeahkcnbneckd

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

# Recommended workflow

1. make changes to the code
2. automatically build the server with npm run build
3. automatically publish the server to dockerhub with npm run publish

# Build the server

## Automatic build
this installs the npm modules and builds storyfinder.js and register.js

```
$ cd storyfinder/webserver
$ npm run build
```

## Manual build

### Manually install npm modules

```
$ npm install -g browserify

$ cd /storyfinder/webserver
$ npm install

$ cd /storyfinder/webserver/public/js
$ npm install
```

### Manually build storyfinder.js

```
$ cd /storyfinder/webserver/public/js
$ browserify index.js -t babelify -t [hbsfy -t] -o storyfinder.js
```

### Manually build register.js

```
$ cd /storyfinder/webserver/public/js
$ browserify register/register.js -t babelify -t [hbsfy -t] -o register.js
```

# Publish the server

## Automatic publish
this automatically builds a the storyfinder-docker and pushes it to uhhlt/storyfinder:latest

```
$ cd storyfinder/webserver
$ npm run publish
```

## Manual publish

### Set the version

```
$ v=0.0.10
```

### Build the storyfinder-docker

```
$ cd storyfinder/webserver
$ docker login --username=<username>
$ docker build -t uhhlt/storyfinder:$v .
```

### Push to uhhlt/storyfinder

```
$ docker login --username=<username>
$ docker push uhhlt/storyfinder:$v
```

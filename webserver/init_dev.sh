#!/bin/bash

apt-get update && apt-get install -y libcairo2-dev libjpeg62-turbo-dev libpango1.0-dev libgif-dev build-essential

cd /usr/src/app && npm install

cd /usr/src/app/public/js && npm install

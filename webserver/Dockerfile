#
# StoryFinder build
#
FROM node:6

RUN DEBIAN_FRONTEND=noninteractive apt-get update \
  && apt-get install -y --no-install-recommends apt-utils \
  && apt-get install -y libcairo2-dev libjpeg62-turbo-dev libpango1.0-dev libgif-dev build-essential \
  && apt-get clean

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

ENV NODE_ENV "development"

COPY package.json /usr/src/app/

RUN npm install

COPY . /usr/src/app

RUN mkdir -p /usr/src/app/public/images

RUN cd /usr/src/app/public/js && npm install

EXPOSE 3055

CMD [ "npm", "start" ]

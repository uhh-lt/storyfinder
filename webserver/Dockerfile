#
# StoryFinder build
#
FROM node:6

RUN set -ex \
      && DEBIAN_FRONTEND=noninteractive \
      && apt-get update \
      && apt-get install -y --no-install-recommends apt-utils locales libcairo2-dev libjpeg62-turbo-dev libpango1.0-dev libgif-dev build-essential \
      && sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
      && dpkg-reconfigure --frontend=noninteractive locales \
      && update-locale LANG=en_US.UTF-8 \
      && apt-get clean
ENV LANG en_US.UTF-8

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

ENV NODE_ENV "development"

ENV COOKIE_SECRET "s3cr31"

COPY package.json /usr/src/app/

COPY . /usr/src/app

RUN mkdir -p /usr/src/app/public/images

RUN [ -e /usr/src/app/node_modules ] && rm -r -f /usr/src/app/node_modules || echo "nothing to do"

RUN [ -e /usr/src/app/public/js/node_modules ] && rm -r -f /usr/src/app/public/js/node_modules || echo "nothing to do"

RUN npm install

RUN cd /usr/src/app/public/js && npm install

EXPOSE 3055

CMD [ "npm", "start" ]

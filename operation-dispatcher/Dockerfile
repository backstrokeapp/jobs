FROM node:8.9-alpine

ADD . /app

WORKDIR /app

RUN rm -rf ./node_modules

RUN yarn

CMD yarn start

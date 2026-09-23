FROM node:26-trixie

RUN npm install -g npm@12.0.2

RUN printf '%s\n' \
  '#!/bin/sh' \
  'data="$(base64 -w0)"' \
  'printf '\''\033]52;c;%s\a'\'' "$data"' \
  > /usr/local/bin/clip \
  && chmod +x /usr/local/bin/clip

WORKDIR /app

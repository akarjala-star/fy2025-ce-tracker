FROM nginx:alpine

RUN apk add --no-cache apache2-utils

COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

RUN htpasswd -bc /etc/nginx/.htpasswd ceadmin password



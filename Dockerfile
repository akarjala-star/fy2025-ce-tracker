FROM nginx:alpine

# htpasswd tool
RUN apk add --no-cache apache2-utils

# Static site + nginx config
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Runtime auth generation
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]

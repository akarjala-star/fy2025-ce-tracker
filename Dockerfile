FROM nginx:alpine

RUN apk add --no-cache apache2-utils

# Copy only the web assets (avoid leaking infra files into web root)
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
COPY src/ /usr/share/nginx/html/src/
COPY rules/ /usr/share/nginx/html/rules/

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]

FROM nginx:alpineFROM nginx:alpasswd tool
RUN apk add --no-cache apache2-utils

# Static site + nginx config
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Runtime auth generation
COPY entrypoint.sh /entrypoint.sh

# Make executable and remove Windows CRLF if present
RUN chmod +x /entrypoint.sh && sed -i 's/\r$//' /entrypoint.sh

# Run with sh to avoid shebang execution issues
CMD ["sh", "/entrypoint.sh"]

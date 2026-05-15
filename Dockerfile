FROM nginx:alpine

# Install htpasswd tool
RUN apk add --no-cache apache2-utils

# Copy static site
COPY . /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Startup script for runtime htpasswd generation
COPY entrypoint.sh /entrypoint.sh

# Make executable + strip Windows CRLF to avoid "/entrypoint.sh: not found"
RUN chmod +x /entrypoint.sh && sed -i 's/\r$//' /entrypoint.sh

# Run script via sh (avoids shebang edge cases)
CMD ["sh", "/entrypoint.sh"]

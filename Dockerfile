FROM nginx:alpine

# Install htpasswd tool
RUN apk add --no-cache apache2-utils

# Copy site files
COPY . /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Generate .htpasswd inside the image (known-good)
RUN htpasswd -bc /etc/nginx/.htpasswd ceadmin password
``


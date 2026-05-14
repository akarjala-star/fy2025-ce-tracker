#!/bin/sh#!/ required environment variables are present
: "${BASIC_AUTH_USER:?Missing BASIC_AUTH_USER}"
: "${BASIC_AUTH_PASS:?Missing BASIC_AUTH_PASS}"

# Generate htpasswd file at container startup
htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS"

# Start nginx in the foreground
exec nginx -g 'daemon off;'
set -e

#!/bin/sh
set -e

: "${BASIC_AUTH_USER:?Missing BASIC_AUTH_USER}"
: "${BASIC_AUTH_PASS:?Missing BASIC_AUTH_PASS}"

# Generate htpasswd at container startup (always fresh)
htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS"

# Start nginx
exec nginx -g 'daemon off;'

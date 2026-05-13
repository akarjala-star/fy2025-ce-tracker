#!/bin/sh
set -e

# Require env vars
: "${BASIC_AUTH_USER:?Missing BASIC_AUTH_USER}"
: "${BASIC_AUTH_PASS:?Missing BASIC_AUTH_PASS}"

# Generate htpasswd file at container startup (always fresh)
htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS"

# Start nginx in foreground
nginx -g 'daemon off;'

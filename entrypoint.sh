#!/bin/sh
set -e

: "${BASIC_AUTH_USER:?Missing BASIC_AUTH_USER}"
: "${BASIC_AUTH_PASS:?Missing BASIC_AUTH_PASS}"

htpasswd -bc /etc/nginx/.htpasswd "$BASIC_AUTH_USER" "$BASIC_AUTH_PASS"

exec nginx -g 'daemon off;'

#!/bin/sh
# Runs inside the frontend container at startup (official nginx image
# executes everything in /docker-entrypoint.d/). Picks the HTTP or HTTPS
# config depending on whether TLS certificates were mounted.
set -e

DEST=/etc/nginx/conf.d/default.conf

if [ -f /etc/nginx/certs/fullchain.pem ] && [ -f /etc/nginx/certs/privkey.pem ]; then
    echo "NexMeet: TLS certs found — enabling HTTPS (HTTP redirects to 443)"
    cp /etc/nexmeet/nginx.ssl.conf "$DEST"
else
    echo "NexMeet: no certs found — serving HTTP only"
    cp /etc/nexmeet/nginx.http.conf "$DEST"
fi

#!/bin/bash
set -euo pipefail

# Read license key from env, or from ~/.config/maxmind/license.key
if [ -z "${MAXMIND_LICENSE_KEY:-}" ]; then
    KEY_FILE="$HOME/.config/maxmind/license.key"
    if [ -f "$KEY_FILE" ]; then
        MAXMIND_LICENSE_KEY=$(cat "$KEY_FILE")
    else
        echo "Error: MAXMIND_LICENSE_KEY not set and $KEY_FILE not found."
        echo ""
        echo "Either:"
        echo "  export MAXMIND_LICENSE_KEY=\"your-key\""
        echo "  or"
        echo "  mkdir -p ~/.config/maxmind && echo \"your-key\" > ~/.config/maxmind/license.key"
        echo ""
        echo "Get a free key at https://www.maxmind.com/en/geolite2/signup → Manage license keys"
        exit 1
    fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Downloading GeoLite2-Country..."
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" -o /tmp/GeoLite2-Country.tar.gz
tar -xzf /tmp/GeoLite2-Country.tar.gz -C /tmp/
cp /tmp/GeoLite2-Country_*/GeoLite2-Country.mmdb "$SCRIPT_DIR/"
rm -rf /tmp/GeoLite2-Country*
echo "Done: $SCRIPT_DIR/GeoLite2-Country.mmdb"

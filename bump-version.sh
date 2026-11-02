#!/bin/sh
# Change le numéro de version avant une mise en ligne : les appareils de Déborah se mettront à jour seuls.
# Usage : ./bump-version.sh 2026.11.15-1
set -e
V="$1"; [ -n "$V" ] || { echo "Usage : $0 <version>"; exit 1; }
cd "$(dirname "$0")"
sed -i '' -E "s/\?v=[0-9A-Za-z.-]+\"/?v=$V\"/g" index.html
sed -i '' -E "s/const APP_VERSION = '[^']*'/const APP_VERSION = '$V'/" js/app.js
printf '{"v":"%s"}\n' "$V" > version.json
echo "Version $V"

#!/usr/bin/env bash
# Copia el build al checkout local de korus_chat para probar la página
# hospedada http://localhost:8084/w/<siteKey>. En Render lo hace el Dockerfile
# de korus_chat (clona este repo en WIDGET_REF y construye).
#
#   npm run build && dev/deploy-local.sh [ruta-a-korus_chat]

set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CHAT="${1:-$HERE/../korus_chat}"
DEST="$CHAT/src/main/resources/static/widget/v1"

[[ -f "$HERE/dist/widget.js" ]] || { echo "No hay dist/widget.js: corre npm run build" >&2; exit 1; }
[[ -d "$CHAT" ]] || { echo "No encuentro korus_chat en $CHAT" >&2; exit 1; }

mkdir -p "$DEST"
cp "$HERE/dist/widget.js" "$DEST/widget.js"
echo "widget.js → $DEST"

# Con spring-boot:run los estáticos se leen de target/classes: copiar ahí
# también hace que korus_chat lo sirva sin reiniciar.
LIVE="$CHAT/target/classes/static/widget/v1"
if [[ -d "$CHAT/target/classes" ]]; then
  mkdir -p "$LIVE" && cp "$HERE/dist/widget.js" "$LIVE/widget.js" && echo "widget.js → $LIVE (en vivo)"
fi

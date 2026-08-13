#!/bin/sh
# Enciende la producción de una vez, en cuanto el web app quede autorizado.
#
# Espera a que GET <URL /exec> responda 200 (la autorización del dueño es el
# único paso humano) y entonces, en orden: importa el mapa real de la sala de
# crisis, sube las filas por el doPost, geocodifica lo que llegó solo con
# dirección, fija las variables del repositorio (adiós modo práctica),
# reconstruye GitHub Pages y corre el humo de producción.
#
# Uso: herramientas/activar-produccion.sh <URL /exec> <URL del mapa My Maps> [código coordinación]
set -e
URL="$1"
MAPA="$2"
CODIGO="${3:-K-01}"
[ -z "$URL" ] || [ -z "$MAPA" ] && { echo "Uso: $0 <URL /exec> <URL mapa> [código]"; exit 1; }
cd "$(dirname "$0")/.."

echo "Esperando la autorización del web app (sondeo cada 60 s, hasta 12 h)…"
i=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' -L "$URL")" = "200" ]; do
  i=$((i + 1))
  [ "$i" -gt 720 ] && echo "Tiempo agotado esperando la autorización" && exit 1
  sleep 60
done
echo "Web app autorizado (respondió 200). Encendiendo producción…"

echo "1/5 Importando el mapa real…"
node herramientas/importar-mymaps.mjs "$MAPA" /tmp/importadas-operacion.csv

echo "2/5 Subiendo las filas a la hoja por el doPost…"
node herramientas/subir-importadas.mjs /tmp/importadas-operacion.csv "$URL" "$CODIGO"

echo "3/5 Geocodificando lo que llegó solo con dirección…"
curl -s -L "$URL?accion=geocodificar&codigo=$CODIGO"
echo

echo "4/5 Conectando el sitio publicado (variables + reconstrucción)…"
gh variable set VITE_CSV_URL --body "$URL"
gh variable set VITE_ENVIOS_URL --body "$URL"
gh workflow run deploy.yml
sleep 10
gh run watch "$(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status > /dev/null
echo "Sitio reconstruido."

echo "5/5 Humo contra la operación real…"
node pruebas/humo-produccion.mjs "$URL" "$CODIGO"

echo
echo "Producción encendida y verificada."

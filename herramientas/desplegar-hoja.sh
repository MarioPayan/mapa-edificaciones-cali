#!/bin/sh
# Despliega el backend real: crea (solo la primera vez) la hoja de la operación
# con su Apps Script, sube el código y publica el web app. Al final imprime la
# URL /exec — esa única URL lee (GET → CSV) y escribe (POST → envíos).
#
# Requisitos, una sola vez:
#   1. npx --yes @google/clasp@2.4.2 login
#   2. Activar «Google Apps Script API» en https://script.google.com/home/usersettings
#
# Tras el primer despliegue hay que abrir la URL /exec en el navegador del dueño
# UNA vez para autorizar los permisos del script (y de paso la hoja se instala sola).
set -e
cd "$(dirname "$0")/../packages/apps-script/src"

CLASP="npx --yes @google/clasp@2.4.2"

if [ ! -f .clasp.json ]; then
  $CLASP create --type sheets --title "Edificaciones afectadas — Cali" --rootDir .
fi

$CLASP push -f

# Si ya hay una implementación, se versiona sobre ella: la URL /exec no cambia.
ID=$($CLASP deployments 2>/dev/null | grep -v '@HEAD' | grep -oE 'AKfycb[[:alnum:]_-]+' | head -1 || true)
if [ -n "$ID" ]; then
  $CLASP deploy -i "$ID" -d "operacion"
else
  $CLASP deploy -d "operacion"
fi

echo
echo "Implementaciones:"
$CLASP deployments
echo
echo "La URL del web app es: https://script.google.com/macros/s/<ID de la implementación>/exec"
echo "Esa misma URL va en VITE_CSV_URL y en VITE_ENVIOS_URL."

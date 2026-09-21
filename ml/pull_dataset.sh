#!/usr/bin/env bash
# Copy the photos shot in the app's Dataset mode from the phone into ml/dataset/.
#   bash ml/pull_dataset.sh            (phone on USB, debug build installed)
# Photos stay on the phone too, so this is safe to run again; existing files are overwritten, not duplicated.
set -euo pipefail
cd "$(dirname "$0")"
APP=in.dikhado.app

adb get-state >/dev/null 2>&1 || { echo "No phone found. Connect it over USB and allow USB debugging."; exit 1; }
adb shell run-as "$APP" test -d files/dataset || { echo "No dataset on the phone yet. Open DikhaDo > Dataset mode and shoot some photos first."; exit 1; }

# run-as works because the dev build is debuggable; exec-out keeps the tar stream binary-safe.
adb exec-out run-as "$APP" tar -cf - -C files dataset | tar -xf -

echo
echo "photos per class (aim for 150+, 60 is the floor):"
for d in dataset/*/; do
  printf "  %-28s %s\n" "$(basename "$d")" "$(find "$d" -type f | wc -l)"
done

#!/usr/bin/env bash
# Copy the photos shot in the app's Dataset mode from the phone into ml/dataset/.
#   bash ml/pull_dataset.sh            (one phone on USB, debug build installed)
# The phone is the source of truth: ml/dataset/ is replaced, so a photo removed in the app
# (Dataset mode > "Remove the last photo") stays removed. To drop a bad photo, remove it on the phone.
set -euo pipefail
cd "$(dirname "$0")"
APP=in.dikhado.app
export MSYS_NO_PATHCONV=1   # Git Bash must not rewrite the on-device paths below

devices=$(adb devices | awk 'NR > 1 && $2 == "device"' | wc -l)
if [ "$devices" -eq 0 ]; then echo "No phone found. Connect it over USB and allow USB debugging."; exit 1; fi
if [ "$devices" -gt 1 ]; then echo "More than one device is attached (an emulator counts). Close the emulator or unplug one, then run again."; exit 1; fi
if ! adb shell run-as "$APP" true >/dev/null 2>&1; then echo "Cannot read $APP on the phone. Install the debug build (npx expo run:android); a release build cannot be read this way."; exit 1; fi
if ! adb shell run-as "$APP" test -d files/dataset; then echo "No dataset on the phone yet. Open DikhaDo > Dataset mode and shoot some photos first."; exit 1; fi

rm -rf dataset.tmp && mkdir dataset.tmp
# run-as works because the dev build is debuggable; exec-out keeps the tar stream binary-safe.
adb exec-out run-as "$APP" tar -cf - -C files dataset | tar -xf - -C dataset.tmp
rm -rf dataset && mv dataset.tmp/dataset dataset && rmdir dataset.tmp

echo
echo "photos per class (aim for 150+, 60 is the floor):"
for d in dataset/*/; do
  printf "  %-28s %s\n" "$(basename "$d")" "$(find "$d" -type f -name '*.jpg' | wc -l)"
done

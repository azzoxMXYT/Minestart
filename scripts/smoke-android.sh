#!/usr/bin/env bash
set -euo pipefail

sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK path is required}}
export PATH="$sdk/emulator:$sdk/platform-tools:$sdk/cmdline-tools/latest/bin:$PATH"
system_image='system-images;android-35;google_apis;x86_64'
if ! command -v emulator >/dev/null; then timeout 240 sdkmanager --install emulator; fi
timeout 240 sdkmanager --install "$system_image"
printf 'no\n' | timeout 45 avdmanager create avd --force --name minestart-ci --package "$system_image"
sudo chmod a+rw /dev/kvm
log=$(mktemp)
emulator -avd minestart-ci -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect >"$log" 2>&1 &
emulator_pid=$!
trap 'status=$?; timeout 5 adb emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true; if (( status )); then tail -80 "$log"; timeout 8 adb logcat -d -s AndroidRuntime chromium | tail -100 || true; fi; rm -f "$log"' EXIT
timeout 150 adb wait-for-device
for ((i=0; i<60; i++)); do
  boot=$(adb shell getprop sys.boot_completed | tr -d '\r')
  [[ $boot != 1 ]] || break
  sleep 2
done
[[ $boot == 1 ]]
adb shell input keyevent 82
adb shell svc wifi disable
adb shell svc data disable
adb install release/Minestart.apk
timeout 45 adb shell am start -W -n io.github.azzoxmxyt.minestart/.MainActivity

# Wait for the installed WebView to expose the enabled Play button, without network.
for ((i=0; i<8; i++)); do
  if timeout 15 adb shell uiautomator dump /sdcard/minestart-ci.xml >/dev/null &&
    adb exec-out cat /sdcard/minestart-ci.xml | grep -E '(text|content-desc)="Jouer"' >/dev/null; then
    printf 'Minestart a démarré hors ligne sur Android.\n'
    exit 0
  fi
  sleep 2
done
printf 'L’écran de jeu Android est introuvable.\n' >&2
exit 1

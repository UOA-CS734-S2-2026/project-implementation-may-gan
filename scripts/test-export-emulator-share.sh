#!/usr/bin/env bash

# Synthetic Android chooser check. No account API or provider credentials are used.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
device="${1:-}"
if [[ ! "$device" =~ ^emulator-[0-9]+$ ]]; then
  echo 'Pass an Android emulator ID, for example emulator-5554.' >&2
  exit 1
fi

adb="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}/platform-tools/adb"
if [[ ! -x "$adb" ]]; then
  echo 'Android platform-tools are required.' >&2
  exit 1
fi
"$adb" -s "$device" get-state >/dev/null

chooser_visible() {
  "$adb" -s "$device" shell dumpsys activity activities 2>/dev/null |
    grep -q 'topResumedActivity=.*com.android.intentresolver'
}
if chooser_visible; then
  echo 'Dismiss any existing Android share chooser before starting.' >&2
  exit 1
fi

synthetic_files() {
  "$adb" -s "$device" shell run-as nz.ac.auckland.dayli.dayli_mobile.staging ls cache 2>/dev/null |
    tr -d '\r' | grep -E '^dayli-export-v2-[a-f0-9]{24}\.zip$' || true
}
if [[ -n "$(synthetic_files)" ]]; then
  echo 'Clear leftover synthetic export files from this emulator before starting.' >&2
  exit 1
fi

log="$(mktemp "${TMPDIR:-/tmp}/dayli-export-emulator-share.XXXXXX")"
test_pid=""
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if chooser_visible; then "$adb" -s "$device" shell input keyevent BACK >/dev/null 2>&1 || true; fi
  if [[ -n "$test_pid" ]]; then
    # Allow the app to return from the chooser and delete its cache file.
    for ((attempt = 0; attempt < 60; attempt++)); do
      if ! kill -0 "$test_pid" 2>/dev/null; then break; fi
      sleep 0.2
    done
    if kill -0 "$test_pid" 2>/dev/null; then kill "$test_pid" 2>/dev/null || true; fi
    wait "$test_pid" 2>/dev/null || true
  fi
  if [[ "$result" -ne 0 ]]; then
    # This test uses a disposable app install and only a fixed synthetic prefix.
    while IFS= read -r leftover; do
      [[ -z "$leftover" ]] || "$adb" -s "$device" shell run-as nz.ac.auckland.dayli.dayli_mobile.staging rm "cache/$leftover" >/dev/null 2>&1 || true
    done < <(synthetic_files)
    tail -n 25 "$log" >&2
  fi
  rm -f "$log"
  exit "$result"
}
trap cleanup EXIT INT TERM

(
  cd "$repo_root/apps/mobile"
  flutter test integration_test/account_export_share_test.dart -d "$device"
) >"$log" 2>&1 &
test_pid=$!

seen=0
for ((attempt = 0; attempt < 120; attempt++)); do
  if chooser_visible; then seen=1; break; fi
  if ! kill -0 "$test_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$seen" != 1 ]]; then
  echo 'The synthetic export did not open the Android share chooser.' >&2
  exit 1
fi

file="$(synthetic_files)"
if [[ -z "$file" || "$file" == *$'\n'* ]]; then
  echo 'Expected exactly one new synthetic ZIP while the chooser was open.' >&2
  exit 1
fi
bytes="$("$adb" -s "$device" shell run-as nz.ac.auckland.dayli.dayli_mobile.staging stat -c '%s' "cache/$file" 2>/dev/null | tr -d '\r')"
if [[ "$bytes" != 22 ]]; then
  echo 'The synthetic ZIP did not match the expected empty archive size.' >&2
  exit 1
fi

"$adb" -s "$device" shell input keyevent BACK >/dev/null
wait "$test_pid"
test_pid=""
if [[ -n "$(synthetic_files)" ]]; then
  echo 'The synthetic ZIP remained in app cache after the chooser closed.' >&2
  exit 1
fi
echo 'Synthetic ZIP reached the Android emulator share chooser and its temporary file was removed.'

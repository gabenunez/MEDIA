#!/usr/bin/env bash
#
# Deploy the Android TV app directly to a TV on the local network.
#
# Usage:
#   ./scripts/deploy-android-tv.sh
#   ./scripts/deploy-android-tv.sh --release
#   ./scripts/deploy-android-tv.sh 192.168.1.42
#
# The script will:
#   1. Find a connected Android TV via adb (mdns, existing connections, or the IP you pass).
#   2. Build the APK with Gradle.
#   3. Install the APK over adb.
#
# Requires `adb` (Android SDK platform-tools) on your PATH and a TV with
# network debugging enabled (usually Settings > Device Preferences > About >
# Build, click 7 times, then Developer options > Network debugging).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_TV_DIR="$ROOT/packages/android-tv"
ADB_PORT=5555

find_adb() {
  if [ -n "${ADB:-}" ]; then
    if command -v "$ADB" >/dev/null 2>&1; then
      echo "$ADB"
      return
    fi
  fi
  if command -v adb >/dev/null 2>&1; then
    echo adb
    return
  fi
  echo "Error: adb not found. Install Android SDK platform-tools or set ADB=/path/to/adb" >&2
  exit 1
}

ADB="$(find_adb)"

connected_devices() {
  "$ADB" devices -l 2>/dev/null | awk 'NR>1 && NF>=2 && $2=="device" {print $1}'
}

mdns_discover() {
  "$ADB" mdns services 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+' | head -1
}

is_ip() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?$ ]]
}

local_ip_and_prefix() {
  # Best-effort: return a /24 based on the machine's local IP.
  # macOS
  if command -v ifconfig >/dev/null 2>&1; then
    local iface ip mask prefix
    iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
    if [ -n "$iface" ]; then
      ip="$(ifconfig "$iface" 2>/dev/null | awk '/inet /{print $2; exit}')"
      if [ -n "$ip" ]; then
        echo "${ip%.*}.0/24"
        return
      fi
    fi
  fi
  # Linux
  if command -v ip >/dev/null 2>&1; then
    local line
    line="$(ip -o -4 route get 1.1.1.1 2>/dev/null | head -1)"
    if [ -n "$line" ]; then
      local src
      src="$(echo "$line" | grep -oE 'src [0-9.]+' | awk '{print $2}')"
      if [ -n "$src" ]; then
        echo "${src%.*}.0/24"
        return
      fi
    fi
  fi
  return 1
}

scan_port() {
  local host="$1" port="$2"
  timeout 0.5 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
}

scan_for_tv() {
  local network
  if ! network="$(local_ip_and_prefix)"; then
    echo "Could not auto-detect local network." >&2
    return 1
  fi

  local base="${network%/*}"
  local prefix="${network#*/}"
  if [ "$prefix" != "24" ]; then
    echo "Auto-scan only supports /24 networks; got $network" >&2
    return 1
  fi

  local base3="${base%.*}"
  echo "Scanning $network for adb port $ADB_PORT (this takes ~25 seconds)..." >&2

  local found=""
  for i in $(seq 1 254); do
    local ip="$base3.$i"
    if scan_port "$ip" "$ADB_PORT"; then
      echo "  adb port open at $ip" >&2
      if "$ADB" connect "$ip" >/dev/null 2>&1; then
        sleep 0.5
        found="$(connected_devices | head -1)"
        if [ -n "$found" ]; then
          echo "  Connected and authorized: $found" >&2
          break
        fi
      fi
    fi
    if [ $((i % 50)) -eq 0 ]; then
      echo "  scanned $i/254..." >&2
    fi
  done

  if [ -n "$found" ]; then
    echo "$found"
  else
    return 1
  fi
}

ensure_device() {
  local preferred="${1:-}"

  # 1. Already connected?
  local devices
  devices="$(connected_devices)"
  if [ -n "$devices" ]; then
    if [ -n "$preferred" ]; then
      local d
      for d in $devices; do
        if [[ "$d" == *"$preferred"* ]]; then
          echo "$d"
          return
        fi
      done
    fi
    echo "$devices" | head -1
    return
  fi

  # 2. Explicit IP provided?
  if [ -n "$preferred" ] && is_ip "$preferred"; then
    echo "Connecting to $preferred..." >&2
    "$ADB" connect "$preferred" >&2
    sleep 0.5
    devices="$(connected_devices)"
    if [ -n "$devices" ]; then
      echo "$devices" | head -1
      return
    fi
    echo "Error: could not connect to $preferred. Make sure network debugging is enabled." >&2
    exit 1
  fi

  # 3. mDNS discovery
  local discovered
  discovered="$(mdns_discover)"
  if [ -n "$discovered" ]; then
    echo "Found Android TV via mDNS: $discovered" >&2
    "$ADB" connect "$discovered" >&2
    sleep 0.5
    devices="$(connected_devices)"
    if [ -n "$devices" ]; then
      echo "$devices" | head -1
      return
    fi
  fi

  # 4. Network scan
  local scanned
  if scanned="$(scan_for_tv)"; then
    echo "$scanned"
    return
  fi

  echo
  echo "No Android TV found automatically." >&2
  echo "Enable network debugging on the TV (Developer options > Network debugging)" >&2
  echo "and make sure your computer is on the same network." >&2
  echo
  read -rp "Enter your TV's IP address (or press Ctrl-C to cancel): " ip
  if is_ip "$ip"; then
    "$ADB" connect "$ip"
    sleep 0.5
    devices="$(connected_devices)"
    if [ -n "$devices" ]; then
      echo "$devices" | head -1
      return
    fi
  fi
  echo "Error: still could not connect." >&2
  exit 1
}

build_apk() {
  local variant=debug
  local task=assembleDebug
  if [ "${1:-}" = "release" ]; then
    variant=release
    task=assembleRelease
  fi
  # Progress/gradle go to stderr so command substitution only captures the path.
  echo "Building $task..." >&2
  (cd "$ANDROID_TV_DIR" && ./gradlew "$task") >&2

  local apk
  apk="$(find "$ANDROID_TV_DIR/app/build/outputs/apk/$variant" -maxdepth 1 -name '*.apk' -print -quit 2>/dev/null)"
  if [ -z "$apk" ] || [ ! -f "$apk" ]; then
    echo "Error: APK not found in $ANDROID_TV_DIR/app/build/outputs/apk/$variant" >&2
    exit 1
  fi
  echo "Built: $apk" >&2
  echo "$apk"
}

install_apk() {
  local device="$1"
  local apk="$2"
  echo "Installing $(basename "$apk") on $device..."

  if ! "$ADB" -s "$device" install -r -d "$apk"; then
    echo
    echo "Install failed. Check the TV screen for an 'allow USB debugging?' prompt and confirm it." >&2
    exit 1
  fi
  echo "Installed successfully."
}

main() {
  local release="no"
  local build_only="no"
  local device_arg=""

  for arg in "$@"; do
    case "$arg" in
      --release) release="yes" ;;
      --build-only) build_only="yes" ;;
      -h|--help)
        sed -n '2,15p' "$0"
        exit 0
        ;;
      *) device_arg="$arg" ;;
    esac
  done

  local apk
  apk="$(build_apk "$release")"

  if [ "$build_only" = "yes" ]; then
    echo "APK ready: $apk"
    exit 0
  fi

  local device
  device="$(ensure_device "$device_arg")"
  install_apk "$device" "$apk"
}

main "$@"

#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 OUTPUT_DIRECTORY" >&2
  exit 64
fi

output_dir=$1
repo_root=$(git rev-parse --show-toplevel)

case "$output_dir" in
  /*) ;;
  *)
    echo "OUTPUT_DIRECTORY must be an absolute path outside the repository" >&2
    exit 64
    ;;
esac

case "$output_dir" in
  "$repo_root"|"$repo_root"/*)
    echo "OUTPUT_DIRECTORY must be outside the repository" >&2
    exit 64
    ;;
esac

if [ -e "$output_dir" ] && [ ! -d "$output_dir" ]; then
  echo "OUTPUT_DIRECTORY is not a directory" >&2
  exit 64
fi

mkdir -p "$output_dir"

port=${PORT:-8787}
base_url="http://127.0.0.1:${port}"
server_log=$(mktemp)
server_pid=

cleanup() {
  if [ -n "$server_pid" ]; then
    local process_group=$server_pid
    server_pid=
    kill -- -"$process_group" 2>/dev/null || true
    wait "$process_group" 2>/dev/null || true
  fi
  rm -f "$server_log"
}
trap cleanup EXIT INT TERM

setsid pnpm start >"$server_log" 2>&1 &
server_pid=$!

ready=false
for _ in $(seq 1 60); do
  if curl --silent --fail --output /dev/null "$base_url/"; then
    ready=true
    break
  fi

  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "rig exited before it became ready" >&2
    exit 1
  fi

  sleep 1
done

if [ "$ready" != true ]; then
  echo "rig did not become ready within 60 seconds" >&2
  exit 1
fi

if ! curl --silent --show-error --fail --output "$output_dir/index.html" \
  "$base_url/digest/2026-10-28"; then
  rm -f "$output_dir/index.html"
  exit 1
fi

printf '%s\n' "$output_dir/index.html"

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

require_env() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

append_openai_headers() {
  local -n _target_array="$1"
  _target_array+=(-H "Authorization: Bearer ${OPENAI_API_KEY}")

  if [[ -n "${OPENAI_PROJECT_ID:-}" ]]; then
    _target_array+=(-H "OpenAI-Project: ${OPENAI_PROJECT_ID}")
  fi

  if [[ -n "${OPENAI_ORGANIZATION_ID:-}" ]]; then
    _target_array+=(-H "OpenAI-Organization: ${OPENAI_ORGANIZATION_ID}")
  fi
}

make_request_id() {
  local prefix="$1"
  printf '%s-%(%Y%m%d%H%M%S)T-%s' "$prefix" -1 "$RANDOM"
}

detect_mime_type() {
  local file_path="$1"
  local extension="${file_path##*.}"
  extension="$(printf '%s' "$extension" | tr '[:upper:]' '[:lower:]')"

  case "$extension" in
    mp3) printf 'audio/mpeg' ;;
    wav) printf 'audio/wav' ;;
    webm) printf 'audio/webm' ;;
    mp4|m4a) printf 'audio/mp4' ;;
    oga|ogg) printf 'audio/ogg' ;;
    flac) printf 'audio/flac' ;;
    aac) printf 'audio/aac' ;;
    opus) printf 'audio/opus' ;;
    pcm) printf 'audio/pcm' ;;
    *) printf 'application/octet-stream' ;;
  esac
}

ensure_parent_dir() {
  local file_path="$1"
  mkdir -p "$(dirname -- "$file_path")"
}

extract_request_id() {
  local header_file="$1"
  awk 'BEGIN{IGNORECASE=1} /^x-request-id:/{gsub("\r","",$2); print $2}' "$header_file" | tail -n 1
}

json_payload_from_env() {
  node <<'NODE'
const payload = {
  model: process.env.MODEL,
};

if (process.env.VOICE) {
  payload.voice = process.env.VOICE;
}

if (process.env.TEXT) {
  payload.input = process.env.TEXT;
}

if (process.env.FORMAT) {
  payload.response_format = process.env.FORMAT;
}

if (process.env.LANGUAGE) {
  payload.language = process.env.LANGUAGE;
}

if (process.env.INSTRUCTIONS) {
  payload.instructions = process.env.INSTRUCTIONS;
}

process.stdout.write(JSON.stringify(payload));
NODE
}

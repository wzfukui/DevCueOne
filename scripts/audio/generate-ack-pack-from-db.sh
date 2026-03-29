#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/audio/generate-ack-pack-from-db.sh --db "/path/to/app-state.sqlite"
  ./scripts/audio/generate-ack-pack-from-db.sh --db "/path/to/app-state.sqlite" --out-dir ./tmp/audio/ack-pack-alibaba --config-id tts-123

Options:
  --db FILE                  SQLite app-state database path (required)
  --out-dir DIR              Output directory, default: ./tmp/audio/ack-pack
  --config-id ID             Specific Alibaba TTS config id; defaults to selected config, then first Alibaba config
  --model MODEL              Override TTS model from DB
  --voice VOICE              Override TTS voice from DB
  --format FORMAT            Output format, default: mp3
  --skip-existing            Skip files that already exist
  --help                     Show this message

Notes:
  - Reads Alibaba Model Studio TTS credentials from the saved app settings.
  - Generates the acknowledgement pack under:
      <out-dir>/zh/*.EXT
      <out-dir>/en/*.EXT
  - Writes manifest.tsv into <out-dir>.
EOF
}

DB_PATH=""
OUT_DIR=""
CONFIG_ID=""
MODEL_OVERRIDE=""
VOICE_OVERRIDE=""
FORMAT="mp3"
SKIP_EXISTING="false"
response_json=""
source_audio=""

cleanup_temp_files() {
  rm -f "${response_json:-}" "${source_audio:-}"
}

trap cleanup_temp_files EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_PATH="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --config-id)
      CONFIG_ID="${2:-}"
      shift 2
      ;;
    --model)
      MODEL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --voice)
      VOICE_OVERRIDE="${2:-}"
      shift 2
      ;;
    --format)
      FORMAT="${2:-}"
      shift 2
      ;;
    --skip-existing)
      SKIP_EXISTING="true"
      shift 1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DB_PATH" ]]; then
  echo "Missing required option: --db" >&2
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required." >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/tmp/audio/ack-pack}"
FORMAT="$(printf '%s' "$FORMAT" | tr '[:upper:]' '[:lower:]')"

normalize_region() {
  printf '%s' "$1" | tr '[:upper:]_' '[:lower:]-' | tr ' ' '-'
}

default_alibaba_base_url() {
  local normalized_region
  normalized_region="$(normalize_region "$1")"

  case "$normalized_region" in
    intl|international|singapore)
      printf 'https://dashscope-intl.aliyuncs.com/api/v1'
      ;;
    *)
      printf 'https://dashscope.aliyuncs.com/api/v1'
      ;;
  esac
}

build_payload_json() {
  MODEL="$1" \
  VOICE="$2" \
  TEXT="$3" \
  LANGUAGE_TYPE="$4" \
  node <<'NODE'
const payload = {
  model: process.env.MODEL,
  input: {
    text: process.env.TEXT,
    voice: process.env.VOICE,
    language_type: process.env.LANGUAGE_TYPE,
  },
}

process.stdout.write(JSON.stringify(payload))
NODE
}

extract_inline_audio_or_url() {
  RESPONSE_PATH="$1" \
  AUDIO_PATH="$2" \
  node <<'NODE'
const fs = require('node:fs')

const responsePath = process.env.RESPONSE_PATH
const audioPath = process.env.AUDIO_PATH
const payload = JSON.parse(fs.readFileSync(responsePath, 'utf8'))

if (payload?.code || payload?.message === 'error') {
  const detail = payload?.message || payload?.code || 'Alibaba TTS request failed.'
  console.error(detail)
  process.exit(1)
}

const inlineAudioBase64 = payload?.output?.audio?.data
if (typeof inlineAudioBase64 === 'string' && inlineAudioBase64.trim()) {
  fs.writeFileSync(audioPath, Buffer.from(inlineAudioBase64, 'base64'))
  process.exit(0)
}

const audioUrl = payload?.output?.audio?.url
if (typeof audioUrl === 'string' && audioUrl.trim()) {
  process.stdout.write(audioUrl.trim())
  process.exit(0)
}

console.error('Alibaba TTS did not return audio data or a download URL.')
process.exit(1)
NODE
}

query_config_sql() {
  local where_clause="$1"
  sqlite3 -separator $'\x1f' "$DB_PATH" "
SELECT
  json_extract(config.value, '$.id'),
  json_extract(config.value, '$.name'),
  json_extract(config.value, '$.model'),
  json_extract(config.value, '$.voice'),
  json_extract(config.value, '$.region'),
  json_extract(config.value, '$.baseUrl'),
  json_extract(config.value, '$.apiKey')
FROM settings
JOIN json_each(json_extract(settings.value, '$.ttsConfigs')) AS config
WHERE settings.key = 'app_settings'
  AND json_extract(config.value, '$.kind') = 'alibaba_model_studio'
  AND ${where_clause}
LIMIT 1;
"
}

CONFIG_ROW=""

if [[ -n "$CONFIG_ID" ]]; then
  CONFIG_ROW="$(query_config_sql "json_extract(config.value, '$.id') = '${CONFIG_ID}'")"
else
  CONFIG_ROW="$(
    query_config_sql "json_extract(config.value, '$.id') = json_extract(settings.value, '$.selectedTtsConfigId')"
  )"

  if [[ -z "$CONFIG_ROW" ]]; then
    CONFIG_ROW="$(query_config_sql "1 = 1")"
  fi
fi

if [[ -z "$CONFIG_ROW" ]]; then
  echo "No Alibaba Model Studio TTS config found in database." >&2
  exit 1
fi

IFS=$'\x1f' read -r CONFIG_ID_RESOLVED CONFIG_NAME MODEL_FROM_DB VOICE_FROM_DB REGION BASE_URL API_KEY <<<"$CONFIG_ROW"

MODEL="${MODEL_OVERRIDE:-$MODEL_FROM_DB}"
VOICE="${VOICE_OVERRIDE:-$VOICE_FROM_DB}"
BASE_URL="${BASE_URL:-$(default_alibaba_base_url "$REGION")}"

if [[ -z "$MODEL" ]]; then
  echo "Alibaba TTS config is missing model." >&2
  exit 1
fi

if [[ -z "$VOICE" ]]; then
  echo "Alibaba TTS config is missing voice." >&2
  exit 1
fi

if [[ -z "$API_KEY" ]]; then
  echo "Alibaba TTS config is missing API key." >&2
  exit 1
fi

mkdir -p "$OUT_DIR/zh" "$OUT_DIR/en"
MANIFEST_PATH="$OUT_DIR/manifest.tsv"
printf "lang\tkey\ttext\tfile\n" > "$MANIFEST_PATH"

ACK_LINES=(
  "zh|ack_zh_01|好的，马上处理。"
  "zh|ack_zh_02|收到。"
  "zh|ack_zh_03|请耐心等待。"
  "zh|ack_zh_04|明白，请稍等。"
  "zh|ack_zh_05|正在提交任务。"
  "zh|ack_zh_06|请稍后。"
  "en|ack_en_01|Okay, I am on it."
  "en|ack_en_02|Received."
  "en|ack_en_03|Please hold on."
  "en|ack_en_04|Understood, one moment."
  "en|ack_en_05|Submitting the task now."
  "en|ack_en_06|Please wait a moment."
)

generated_count=0
skipped_count=0

for entry in "${ACK_LINES[@]}"; do
  IFS='|' read -r lang key text <<<"$entry"

  output_path="$OUT_DIR/${lang}/${key}.${FORMAT}"

  if [[ "$SKIP_EXISTING" == "true" && -f "$output_path" ]]; then
    skipped_count=$((skipped_count + 1))
    printf "%s\t%s\t%s\t%s\n" "$lang" "$key" "$text" "$output_path" >> "$MANIFEST_PATH"
    continue
  fi

  ensure_parent_dir "$output_path"

  language_type="Chinese"
  if [[ "$lang" == "en" ]]; then
    language_type="English"
  fi

  payload_json="$(build_payload_json "$MODEL" "$VOICE" "$text" "$language_type")"
  response_json="$(mktemp)"
  source_audio="$(mktemp -t voice-agent-ack-source).wav"

  http_code="$(
    curl -sS \
      -X POST \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      --data "$payload_json" \
      --output "$response_json" \
      --write-out "%{http_code}" \
      "${BASE_URL}/services/aigc/multimodal-generation/generation"
  )"

  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "Alibaba TTS request failed for ${key} (HTTP ${http_code})." >&2
    cat "$response_json" >&2
    exit 1
  fi

  audio_url="$(extract_inline_audio_or_url "$response_json" "$source_audio")"
  if [[ -n "$audio_url" ]]; then
    curl -sS "$audio_url" --output "$source_audio"
  fi

  case "$FORMAT" in
    mp3)
      ffmpeg -y -loglevel error -i "$source_audio" -codec:a libmp3lame -q:a 2 "$output_path"
      ;;
    wav)
      ffmpeg -y -loglevel error -i "$source_audio" "$output_path"
      ;;
    *)
      ffmpeg -y -loglevel error -i "$source_audio" "$output_path"
      ;;
  esac

  rm -f "$response_json" "$source_audio"
  response_json=""
  source_audio=""

  generated_count=$((generated_count + 1))
  printf "%s\t%s\t%s\t%s\n" "$lang" "$key" "$text" "$output_path" >> "$MANIFEST_PATH"
done

echo "Generated: $generated_count"
echo "Skipped: $skipped_count"
echo "Manifest: $MANIFEST_PATH"
echo "Config: ${CONFIG_NAME} (${CONFIG_ID_RESOLVED})"
echo "Model: $MODEL"
echo "Voice: $VOICE"

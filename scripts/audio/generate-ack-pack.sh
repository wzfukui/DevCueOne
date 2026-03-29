#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/audio/generate-ack-pack.sh
  ./scripts/audio/generate-ack-pack.sh --out-dir ./tmp/audio/ack-pack-v2 --voice-zh coral --voice-en allay

Options:
  --out-dir DIR              Output directory, default: ./tmp/audio/ack-pack
  --model MODEL              Override OPENAI_TTS_MODEL
  --format FORMAT            Override OPENAI_TTS_FORMAT
  --voice-zh VOICE           Voice for Chinese phrases
  --voice-en VOICE           Voice for English phrases
  --language-zh LANG         Language hint for Chinese phrases, default: zh
  --language-en LANG         Language hint for English phrases, default: en
  --env-file FILE            Load variables from a specific .env file
  --skip-existing            Skip files that already exist
  --help                     Show this message

Notes:
  - Output files are generated under:
      <out-dir>/zh/*.EXT
      <out-dir>/en/*.EXT
  - A manifest.tsv file is also written into <out-dir>.
EOF
}

OUT_DIR=""
MODEL=""
FORMAT=""
VOICE_ZH=""
VOICE_EN=""
LANGUAGE_ZH="zh"
LANGUAGE_EN="en"
SKIP_EXISTING="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --format)
      FORMAT="${2:-}"
      shift 2
      ;;
    --voice-zh)
      VOICE_ZH="${2:-}"
      shift 2
      ;;
    --voice-en)
      VOICE_EN="${2:-}"
      shift 2
      ;;
    --language-zh)
      LANGUAGE_ZH="${2:-}"
      shift 2
      ;;
    --language-en)
      LANGUAGE_EN="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
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

load_env
require_env OPENAI_API_KEY

OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/tmp/audio/ack-pack}"
MODEL="${MODEL:-${OPENAI_TTS_MODEL:-gpt-4o-mini-tts}}"
FORMAT="${FORMAT:-${OPENAI_TTS_FORMAT:-mp3}}"
VOICE_ZH="${VOICE_ZH:-${OPENAI_TTS_VOICE:-coral}}"
VOICE_EN="${VOICE_EN:-${OPENAI_TTS_VOICE:-coral}}"

ZH_INSTRUCTIONS="${OPENAI_TTS_ACK_ZH_INSTRUCTIONS:-自然、简洁、友好的中文确认回复，语速平稳，适合桌面语音助手。}"
EN_INSTRUCTIONS="${OPENAI_TTS_ACK_EN_INSTRUCTIONS:-A natural, concise, friendly English acknowledgement for a desktop voice assistant.}"

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

  if [[ "$lang" == "zh" ]]; then
    output_path="$OUT_DIR/zh/${key}.${FORMAT}"
    voice="$VOICE_ZH"
    language="$LANGUAGE_ZH"
    instructions="$ZH_INSTRUCTIONS"
  else
    output_path="$OUT_DIR/en/${key}.${FORMAT}"
    voice="$VOICE_EN"
    language="$LANGUAGE_EN"
    instructions="$EN_INSTRUCTIONS"
  fi

  if [[ "$SKIP_EXISTING" == "true" && -f "$output_path" ]]; then
    skipped_count=$((skipped_count + 1))
  else
    "$SCRIPT_DIR/generate-tts.sh" \
      --env-file "$ENV_FILE" \
      --text "$text" \
      --output "$output_path" \
      --model "$MODEL" \
      --voice "$voice" \
      --format "$FORMAT" \
      --language "$language" \
      --instructions "$instructions"
    generated_count=$((generated_count + 1))
  fi

  printf "%s\t%s\t%s\t%s\n" "$lang" "$key" "$text" "$output_path" >> "$MANIFEST_PATH"
done

echo "Generated: $generated_count"
echo "Skipped: $skipped_count"
echo "Manifest: $MANIFEST_PATH"

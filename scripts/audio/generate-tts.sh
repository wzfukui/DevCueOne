#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/audio/generate-tts.sh --text "收到" --output ./tmp/ack-zh.mp3
  ./scripts/audio/generate-tts.sh --text-file ./input.txt --output ./tmp/out.wav --format wav --voice cedar

Options:
  --text TEXT                 Inline text to synthesize
  --text-file FILE            Read text from file
  --output FILE               Output audio path (required)
  --voice VOICE               Override OPENAI_TTS_VOICE
  --model MODEL               Override OPENAI_TTS_MODEL
  --format FORMAT             Override OPENAI_TTS_FORMAT (mp3/wav/opus/aac/flac/pcm)
  --language LANGUAGE         Optional language hint
  --instructions TEXT         Optional speaking instructions
  --instructions-file FILE    Read speaking instructions from file
  --env-file FILE             Load variables from a specific .env file
  --help                      Show this message

Environment:
  OPENAI_API_KEY              Required
  OPENAI_TTS_MODEL            Default: gpt-4o-mini-tts
  OPENAI_TTS_VOICE            Default: coral
  OPENAI_TTS_FORMAT           Default: mp3
  OPENAI_TTS_INSTRUCTIONS     Optional default instructions
  OPENAI_TTS_LANGUAGE         Optional default language
EOF
}

TEXT=""
TEXT_FILE=""
OUTPUT_PATH=""
VOICE=""
MODEL=""
FORMAT=""
LANGUAGE=""
INSTRUCTIONS=""
INSTRUCTIONS_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)
      TEXT="${2:-}"
      shift 2
      ;;
    --text-file)
      TEXT_FILE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    --voice)
      VOICE="${2:-}"
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
    --language)
      LANGUAGE="${2:-}"
      shift 2
      ;;
    --instructions)
      INSTRUCTIONS="${2:-}"
      shift 2
      ;;
    --instructions-file)
      INSTRUCTIONS_FILE="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
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

if [[ -n "$TEXT" && -n "$TEXT_FILE" ]]; then
  echo "Use either --text or --text-file, not both." >&2
  exit 1
fi

if [[ -z "$TEXT" && -z "$TEXT_FILE" ]]; then
  echo "Missing input text. Use --text or --text-file." >&2
  exit 1
fi

if [[ -z "$OUTPUT_PATH" ]]; then
  echo "Missing required option: --output" >&2
  exit 1
fi

if [[ -n "$TEXT_FILE" ]]; then
  if [[ ! -f "$TEXT_FILE" ]]; then
    echo "Text file not found: $TEXT_FILE" >&2
    exit 1
  fi
  TEXT="$(<"$TEXT_FILE")"
fi

if [[ -n "$INSTRUCTIONS_FILE" ]]; then
  if [[ ! -f "$INSTRUCTIONS_FILE" ]]; then
    echo "Instructions file not found: $INSTRUCTIONS_FILE" >&2
    exit 1
  fi
  INSTRUCTIONS="$(<"$INSTRUCTIONS_FILE")"
fi

MODEL="${MODEL:-${OPENAI_TTS_MODEL:-gpt-4o-mini-tts}}"
VOICE="${VOICE:-${OPENAI_TTS_VOICE:-coral}}"
FORMAT="${FORMAT:-${OPENAI_TTS_FORMAT:-mp3}}"
LANGUAGE="${LANGUAGE:-${OPENAI_TTS_LANGUAGE:-}}"
INSTRUCTIONS="${INSTRUCTIONS:-${OPENAI_TTS_INSTRUCTIONS:-}}"

ensure_parent_dir "$OUTPUT_PATH"

REQUEST_ID="$(make_request_id voice-agent-tts)"
HEADERS_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$HEADERS_FILE" "$BODY_FILE"' EXIT

PAYLOAD_JSON="$(
  TEXT="$TEXT" \
  MODEL="$MODEL" \
  VOICE="$VOICE" \
  FORMAT="$FORMAT" \
  LANGUAGE="$LANGUAGE" \
  INSTRUCTIONS="$INSTRUCTIONS" \
  json_payload_from_env
)"

CURL_ARGS=(
  https://api.openai.com/v1/audio/speech
  -sS
  -X POST
  -H "Content-Type: application/json"
  -H "X-Client-Request-Id: ${REQUEST_ID}"
  --data "$PAYLOAD_JSON"
  --output "$BODY_FILE"
  --dump-header "$HEADERS_FILE"
  --write-out "%{http_code}"
)

append_openai_headers CURL_ARGS

HTTP_CODE="$(curl "${CURL_ARGS[@]}")"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "OpenAI TTS request failed (HTTP $HTTP_CODE)." >&2
  if [[ -s "$BODY_FILE" ]]; then
    cat "$BODY_FILE" >&2
    printf '\n' >&2
  fi
  exit 1
fi

mv "$BODY_FILE" "$OUTPUT_PATH"
REQUEST_HEADER_ID="$(extract_request_id "$HEADERS_FILE")"

echo "Saved audio to: $OUTPUT_PATH"
echo "Model: $MODEL"
echo "Voice: $VOICE"
echo "Format: $FORMAT"
if [[ -n "$LANGUAGE" ]]; then
  echo "Language: $LANGUAGE"
fi
if [[ -n "$REQUEST_HEADER_ID" ]]; then
  echo "OpenAI request id: $REQUEST_HEADER_ID"
fi

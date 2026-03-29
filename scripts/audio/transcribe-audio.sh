#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/audio/transcribe-audio.sh --file ./sample.wav
  ./scripts/audio/transcribe-audio.sh --file ./sample.webm --language zh --output ./tmp/transcript.json

Options:
  --file FILE                 Input audio file (required)
  --output FILE               Optional output path, defaults to stdout
  --model MODEL               Override OPENAI_STT_MODEL
  --language LANGUAGE         Override OPENAI_STT_LANGUAGE
  --response-format FORMAT    Override OPENAI_STT_RESPONSE_FORMAT (json/text/srt/verbose_json/vtt)
  --prompt TEXT               Optional transcription prompt
  --prompt-file FILE          Read prompt from file
  --env-file FILE             Load variables from a specific .env file
  --help                      Show this message

Environment:
  OPENAI_API_KEY              Required
  OPENAI_STT_MODEL            Default: gpt-4o-mini-transcribe
  OPENAI_STT_LANGUAGE         Optional default language
  OPENAI_STT_RESPONSE_FORMAT  Default: json
  OPENAI_STT_PROMPT           Optional default prompt
EOF
}

INPUT_FILE=""
OUTPUT_PATH=""
MODEL=""
LANGUAGE=""
RESPONSE_FORMAT=""
PROMPT=""
PROMPT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      INPUT_FILE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --language)
      LANGUAGE="${2:-}"
      shift 2
      ;;
    --response-format)
      RESPONSE_FORMAT="${2:-}"
      shift 2
      ;;
    --prompt)
      PROMPT="${2:-}"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="${2:-}"
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

if [[ -z "$INPUT_FILE" ]]; then
  echo "Missing required option: --file" >&2
  exit 1
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Input file not found: $INPUT_FILE" >&2
  exit 1
fi

if [[ -n "$PROMPT_FILE" ]]; then
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Prompt file not found: $PROMPT_FILE" >&2
    exit 1
  fi
  PROMPT="$(<"$PROMPT_FILE")"
fi

MODEL="${MODEL:-${OPENAI_STT_MODEL:-gpt-4o-mini-transcribe}}"
LANGUAGE="${LANGUAGE:-${OPENAI_STT_LANGUAGE:-}}"
RESPONSE_FORMAT="${RESPONSE_FORMAT:-${OPENAI_STT_RESPONSE_FORMAT:-json}}"
PROMPT="${PROMPT:-${OPENAI_STT_PROMPT:-}}"
MIME_TYPE="$(detect_mime_type "$INPUT_FILE")"

HEADERS_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$HEADERS_FILE" "$BODY_FILE"' EXIT

REQUEST_ID="$(make_request_id voice-agent-stt)"

CURL_ARGS=(
  https://api.openai.com/v1/audio/transcriptions
  -sS
  -X POST
  -H "X-Client-Request-Id: ${REQUEST_ID}"
  -F "file=@${INPUT_FILE};type=${MIME_TYPE}"
  -F "model=${MODEL}"
  -F "response_format=${RESPONSE_FORMAT}"
  --output "$BODY_FILE"
  --dump-header "$HEADERS_FILE"
  --write-out "%{http_code}"
)

if [[ -n "$LANGUAGE" ]]; then
  CURL_ARGS+=(-F "language=${LANGUAGE}")
fi

if [[ -n "$PROMPT" ]]; then
  CURL_ARGS+=(-F "prompt=${PROMPT}")
fi

append_openai_headers CURL_ARGS

HTTP_CODE="$(curl "${CURL_ARGS[@]}")"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "OpenAI transcription request failed (HTTP $HTTP_CODE)." >&2
  if [[ -s "$BODY_FILE" ]]; then
    cat "$BODY_FILE" >&2
    printf '\n' >&2
  fi
  exit 1
fi

if [[ -n "$OUTPUT_PATH" ]]; then
  ensure_parent_dir "$OUTPUT_PATH"
  mv "$BODY_FILE" "$OUTPUT_PATH"
  echo "Saved transcript to: $OUTPUT_PATH"
else
  cat "$BODY_FILE"
fi

REQUEST_HEADER_ID="$(extract_request_id "$HEADERS_FILE")"
echo "Model: $MODEL" >&2
if [[ -n "$LANGUAGE" ]]; then
  echo "Language: $LANGUAGE" >&2
fi
echo "Response format: $RESPONSE_FORMAT" >&2
if [[ -n "$REQUEST_HEADER_ID" ]]; then
  echo "OpenAI request id: $REQUEST_HEADER_ID" >&2
fi

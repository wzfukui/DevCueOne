#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ -z "${NVM_DIR:-}" && -d "${HOME}/.nvm" ]]; then
  export NVM_DIR="${HOME}/.nvm"
fi

if [[ -n "${NVM_DIR:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR}/nvm.sh"
  nvm use 22 >/dev/null
fi

if [[ -f ".env.signing.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  . ".env.signing.local"
  set +a
fi

exec node ./scripts/release-macos-local.mjs "$@"

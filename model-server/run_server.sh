#!/usr/bin/env bash
set -euo pipefail
# Activate conda env if available
if [[ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/miniconda3/etc/profile.d/conda.sh"
  conda activate hackharvard || echo "[warn] Could not auto-activate conda env 'hackharvard'"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

python -m uvicorn server:app --reload --port 8000

"""Resolve the app's pinned local dependencies, without requiring a Codex session."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
RUNTIME=ROOT/'.local-runtime'
NODE=RUNTIME/'node/bin/node'
PLUGIN=RUNTIME/'data-plugin'
BUILD=PLUGIN/'scripts/data-app.mjs'
PYTHON=RUNTIME/'python/bin/python3'

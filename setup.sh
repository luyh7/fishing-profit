#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Error: not inside a git repository" >&2
  exit 1
}

cd "$repo_root"

if [ ! -f .githooks/pre-commit ]; then
  echo "Error: .githooks/pre-commit not found" >&2
  exit 1
fi

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "Git hooks configured: core.hooksPath = .githooks"

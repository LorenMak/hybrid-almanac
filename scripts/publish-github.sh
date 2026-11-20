#!/usr/bin/env bash
# Publish Hybrid Almanac to LorenMak/hybrid-almanac on GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="LorenMak/hybrid-almanac"
BRANCH="main"

echo "==> Checking GitHub auth…"
/exec-daemon/gh api user --jq .login

echo "==> Ensuring remote repository exists…"
if ! /exec-daemon/gh repo view "$REPO" >/dev/null 2>&1; then
  /exec-daemon/gh repo create "$REPO" \
    --public \
    --description "中西雙曆法擇日 · CUHK New Asia College engineering student project (linguistics, astronomy, Chinese traditional culture)" \
    --source=. \
    --remote=origin \
    --push=false
else
  echo "Repo already exists."
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/${REPO}.git"
fi

echo "==> Preparing main branch…"
# Prefer publishing as main for GitHub default
current="$(git branch --show-current)"
if [[ "$current" != "main" ]]; then
  git branch -M main
fi

echo "==> Pushing…"
git push -u origin main

echo "==> Done: https://github.com/${REPO}"
/exec-daemon/gh repo view "$REPO" --web=false

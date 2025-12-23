#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <version>"
  echo "Example: $0 0.1.1"
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi

if [[ -z "${1:-}" ]]; then
  usage
fi

raw_version="$1"
version="${raw_version#v}"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid version: $raw_version"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

node -e "const fs=require('fs');const path='package.json';const data=JSON.parse(fs.readFileSync(path,'utf8'));data.version=process.argv[1];fs.writeFileSync(path, JSON.stringify(data,null,2)+'\\n');" "$version"

if [[ -f package-lock.json ]]; then
  node -e "const fs=require('fs');const path='package-lock.json';const data=JSON.parse(fs.readFileSync(path,'utf8'));data.version=process.argv[1];if(data.packages&&data.packages['']){data.packages[''].version=process.argv[1];}fs.writeFileSync(path, JSON.stringify(data,null,2)+'\\n');" "$version"
fi

git add package.json
if [[ -f package-lock.json ]]; then
  git add package-lock.json
fi

git commit -m "Release v$version"
git tag -a "v$version" -m "Release v$version"

echo "Created commit and tag v$version."
echo "Next: git push origin main --tags"

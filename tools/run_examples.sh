#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

schema_path="${repo_root}/schema2.json"
examples_dir="${repo_root}/examples"

if [[ ! -f "${schema_path}" ]]; then
  echo "error: schema not found at ${schema_path}" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required (for ajv-cli via npx)" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "error: npx is required (install Node.js/npm)" >&2
  exit 1
fi

# npx uses ~/.npm by default; in some environments that cache can be unwritable.
# Use a repo-local cache so this script works without any global npm setup.
export NPM_CONFIG_CACHE="${repo_root}/.cache/npm"
mkdir -p -- "${NPM_CONFIG_CACHE}"

usage() {
  cat >&2 <<'EOF'
Usage:
  tools/run_examples.sh                 # validate all examples/*.json
  tools/run_examples.sh path/to/a.json  # validate specific files

This validates JSON files against schema.json using ajv-cli (draft 2020).
EOF
}

declare -a files=()
if [[ "${#}" -gt 0 ]]; then
  case "${1}" in
    -h|--help)
      usage
      exit 0
      ;;
  esac

  for arg in "$@"; do
    files+=("${arg}")
  done
else
  if [[ -d "${examples_dir}" ]]; then
    while IFS= read -r -d '' file; do
      files+=("${file}")
    done < <(find "${examples_dir}" -maxdepth 1 -type f -name '*.json' -print0 | sort -z)
  fi
fi

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "error: no example JSON files found (expected ${examples_dir}/*.json)" >&2
  exit 1
fi

for file in "${files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "error: file not found: ${file}" >&2
    exit 1
  fi
done

echo "Validating ${#files[@]} file(s) against schema.json..."
for file in "${files[@]}"; do
  echo "- ${file}"
  npx --yes ajv-cli validate \
    -s "${schema_path}" \
    -d "${file}" \
    --spec=draft2020
done

echo "OK"

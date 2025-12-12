#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

usage() {
  cat >&2 <<'EOF'
Usage:
  tools/run_examples.sh                 # runs the test suite (includes fixtures)
  tools/run_examples.sh path/to/a.json  # validates one fixture file

Note:
  This repo has moved from `examples/` to `tests/` (fixtures + case suites).
  Prefer: `npm test` or `node tools/test_suite.js`.
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

if [[ "${#}" -eq 0 ]]; then
  exec node "${repo_root}/tools/test_suite.js"
fi

declare -a args=()
for file in "$@"; do
  args+=("--fixtureFile" "${file}")
done

exec node "${repo_root}/tools/test_suite.js" "${args[@]}"


#!/usr/bin/env bash
cd "$(dirname "$0")"

echo ""
echo "  ================================"
echo "    QA Copilot"
echo "  ================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed. Get the LTS build from https://nodejs.org"
  exit 1
fi

[ -d node_modules/express ] || { echo "  Installing dependencies..."; npm install --no-audit --no-fund; }
[ -f data/projects.json ] || { echo "  First run - creating the demo project..."; node seed.js; }

echo "  Open http://localhost:4100"
echo "  Press Ctrl+C to stop."
echo ""

(sleep 2 && (command -v open >/dev/null && open http://localhost:4100 || xdg-open http://localhost:4100 2>/dev/null)) &
node server.js

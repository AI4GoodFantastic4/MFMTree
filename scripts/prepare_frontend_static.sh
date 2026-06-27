#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="${1:-ai4goodhackathonmfmtree}"
PUBLIC_DIR="$FRONTEND_DIR/.output/public"
SERVER_ENTRY="$FRONTEND_DIR/.output/server/index.mjs"

if [[ ! -f "$SERVER_ENTRY" ]]; then
  echo "Missing built frontend server entry: $SERVER_ENTRY" >&2
  echo "Run npm --prefix $FRONTEND_DIR run build first." >&2
  exit 1
fi

node --input-type=module - "$FRONTEND_DIR" "$PUBLIC_DIR" "$SERVER_ENTRY" <<'JS'
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , frontendDir, publicDir, serverEntry] = process.argv;
const server = await import(pathToFileURL(path.resolve(serverEntry)).href);
const handler = server.default || server;

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

const response = await handler.fetch(new Request("https://mfmtree.local/"), {}, context);
if (!response.ok) {
  throw new Error(`Static render failed with HTTP ${response.status}`);
}

const html = await response.text();
await fs.mkdir(path.resolve(publicDir), { recursive: true });
await fs.writeFile(path.resolve(publicDir, "index.html"), html);
console.log(`Prepared static frontend shell at ${path.join(frontendDir, ".output/public/index.html")}`);
JS

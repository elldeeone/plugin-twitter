#!/usr/bin/env bash
# Patches twitter-api-v2 to support http:// URLs (for local playground testing).
# The library hardcodes https.request(); this adds http.request() fallback.
# Patches both CJS and ESM builds.

patch_cjs() {
  local TARGET="node_modules/twitter-api-v2/dist/cjs/client-mixins/request-handler.helper.js"
  if [ ! -f "$TARGET" ]; then
    echo "[patch] CJS request handler not found, skipping"
    return
  fi
  if grep -q 'const http_1 = require("http")' "$TARGET"; then
    echo "[patch] CJS already patched"
    return
  fi
  sed -i.bak 's|const https_1 = require("https");|const https_1 = require("https");\nconst http_1 = require("http");|' "$TARGET"
  sed -i.bak "s|this.req = (0, https_1.request)({|const requestFn = url.protocol === 'http:' ? http_1.request : https_1.request;\n        this.req = requestFn({|" "$TARGET"
  rm -f "${TARGET}.bak"
  echo "[patch] CJS patched for http:// support"
}

patch_esm() {
  local TARGET="node_modules/twitter-api-v2/dist/esm/client-mixins/request-handler.helper.js"
  if [ ! -f "$TARGET" ]; then
    echo "[patch] ESM request handler not found, skipping"
    return
  fi
  if grep -q "import { request as httpRequest } from 'http'" "$TARGET"; then
    echo "[patch] ESM already patched"
    return
  fi
  sed -i.bak "s|import { request } from 'https';|import { request } from 'https';\nimport { request as httpRequest } from 'http';|" "$TARGET"
  sed -i.bak "s|this.req = request({|const requestFn = url.protocol === 'http:' ? httpRequest : request;\n        this.req = requestFn({|" "$TARGET"
  rm -f "${TARGET}.bak"
  echo "[patch] ESM patched for http:// support"
}

patch_cjs
patch_esm

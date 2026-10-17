#!/usr/bin/env node
import { createRequire } from "node:module";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBridgeServer, MISSING_KEY_MESSAGE } from "./bridge.js";
import { connectRemote, resolveRemoteUrl } from "./remote.js";

const { version } = createRequire(import.meta.url)("../package.json");
const KEY_PATTERN = /^gga_(live|test)_/;

const apiKey = process.env.GEOGRIDAPI_API_KEY?.trim() || undefined;
let url;
try {
  url = resolveRemoteUrl(process.env.GEOGRIDAPI_MCP_URL);
} catch (error) {
  console.error(`[geogridapi-mcp] ${error.message}`);
  process.exit(1);
}

if (!apiKey) {
  console.error(`[geogridapi-mcp] ${MISSING_KEY_MESSAGE}`);
} else if (!KEY_PATTERN.test(apiKey)) {
  console.error("[geogridapi-mcp] GEOGRIDAPI_API_KEY should start with gga_live_ or gga_test_.");
}

const server = createBridgeServer({
  apiKey,
  version,
  connectRemote: () => connectRemote({ url, apiKey, version }),
});

await server.connect(new StdioServerTransport());
// The client closing stdin ends the session: flush pending answers, then don't linger on an open HTTP stream.
const EXIT_GRACE_MS = 2_000;
process.stdin.on("end", () => setTimeout(() => process.exit(0), EXIT_GRACE_MS));

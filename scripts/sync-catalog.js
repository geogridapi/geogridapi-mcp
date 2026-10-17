// Refreshes src/catalog.json from the hosted server: GEOGRIDAPI_API_KEY=gga_test_… npm run sync-catalog
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { connectRemote, resolveRemoteUrl } from "../src/remote.js";

const { version } = createRequire(import.meta.url)("../package.json");
const apiKey = process.env.GEOGRIDAPI_API_KEY?.trim();
if (!apiKey) {
  console.error("Set GEOGRIDAPI_API_KEY (a free gga_test_ key is enough).");
  process.exit(1);
}

const client = await connectRemote({ url: resolveRemoteUrl(process.env.GEOGRIDAPI_MCP_URL), apiKey, version });
const [{ tools }, { prompts }] = await Promise.all([client.listTools(), client.listPrompts()]);
const catalog = { instructions: client.getInstructions(), tools, prompts };
await writeFile(new URL("../src/catalog.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
await client.close();
console.log(`catalog.json: ${tools.length} tools, ${prompts.length} prompts`);

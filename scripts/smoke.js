// End-to-end check over stdio against the hosted server: GEOGRIDAPI_API_KEY=gga_test_… npm run smoke
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../src/index.js", import.meta.url))],
  env: { ...process.env },
  stderr: "inherit",
});
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);

const { tools } = await client.listTools();
const { prompts } = await client.listPrompts();
const balance = await client.callTool({ name: "get_balance", arguments: {} });
console.log(`${tools.length} tools, ${prompts.length} prompts`);
console.log(balance.content.find((part) => part.type === "text")?.text);
await client.close();
if (balance.isError) process.exit(1);

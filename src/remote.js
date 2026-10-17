import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LIST_TIMEOUT_MS } from "./bridge.js";

export const DEFAULT_MCP_URL = "https://api.geogridapi.io/mcp";

/** Rejects anything but HTTPS, except plain HTTP on localhost for development. */
export function resolveRemoteUrl(value) {
  let url;
  try {
    url = new URL(value || DEFAULT_MCP_URL);
  } catch {
    throw new Error(`GEOGRIDAPI_MCP_URL is not a valid URL: ${value}`);
  }
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error(`GEOGRIDAPI_MCP_URL must use https: ${url.href}`);
  }
  return url;
}

/** Opens an MCP client session on the hosted server, authenticated with the API key. */
export async function connectRemote({ url, apiKey, version }) {
  const client = new Client({ name: "geogridapi-mcp", version });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": `geogridapi-mcp/${version}`,
      },
    },
  });
  await client.connect(transport, { timeout: LIST_TIMEOUT_MS });
  return client;
}

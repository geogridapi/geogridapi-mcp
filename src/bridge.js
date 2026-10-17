import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const catalog = createRequire(import.meta.url)("./catalog.json");

// run_grid and run_grids wait up to 60 s on the hosted server; leave room for slow networks.
export const CALL_TIMEOUT_MS = 150_000;
export const LIST_TIMEOUT_MS = 20_000;
const MAX_ERROR_LENGTH = 300;

export const MISSING_KEY_MESSAGE =
  "GEOGRIDAPI_API_KEY is not set. Create a key in the console at https://geogridapi.io " +
  "(gga_test_ keys are free and return sample grids) and add it to this server's environment.";

const REJECTED_KEY_MESSAGE =
  "GeoGridAPI rejected the API key (HTTP 401). Check GEOGRIDAPI_API_KEY: the key may be revoked or mistyped.";

const MAYBE_CHARGED_HINT =
  " The grid may already be running and charged: check list_grids (or get_batch) before running it again.";

// Tools that spend credits and are not safe to repeat blindly.
const PAID_TOOLS = new Set(
  catalog.tools
    .filter((tool) => tool.annotations?.readOnlyHint === false && tool.annotations?.idempotentHint === false)
    .map((tool) => tool.name),
);

export function catalogTools() {
  return catalog.tools;
}

export function catalogPrompts() {
  return catalog.prompts;
}

export function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  // StreamableHTTPError carries the HTTP status in `code`.
  if (error?.code === 401 || /\b401\b|invalid_token|invalid_key/.test(message)) return REJECTED_KEY_MESSAGE;
  const short = message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
  return `GeoGridAPI request failed: ${short}`;
}

/** A JSON-RPC error answered by the server means the call was refused; a timeout or a dropped connection is ambiguous. */
function mayHaveCharged(error) {
  return !(error instanceof McpError) || error.code === ErrorCode.RequestTimeout;
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}

function log(message) {
  // stdout carries the MCP protocol: diagnostics go to stderr.
  console.error(`[geogridapi-mcp] ${message}`);
}

/**
 * Local stdio server that relays every request to the hosted GeoGridAPI MCP server.
 * Without an API key it still answers introspection from the bundled catalog.
 */
export function createBridgeServer({ apiKey, connectRemote, version }) {
  let remotePromise = null;

  function getRemote() {
    remotePromise ??= connectRemote().catch((error) => {
      remotePromise = null;
      throw error;
    });
    return remotePromise;
  }

  function forgetRemote(error) {
    // A protocol error comes from a live session; anything else may be a dead one.
    if (!(error instanceof McpError)) remotePromise = null;
  }

  const server = new Server(
    { name: "geogridapi", title: "GeoGridAPI", version },
    { capabilities: { tools: {}, prompts: {} }, instructions: catalog.instructions },
  );

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    if (!apiKey) return { tools: catalog.tools };
    try {
      const remote = await getRemote();
      return await remote.listTools(request.params, { timeout: LIST_TIMEOUT_MS });
    } catch (error) {
      forgetRemote(error);
      log(`listing tools from the bundled catalog: ${describeError(error)}`);
      return { tools: catalog.tools };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!apiKey) return errorResult(MISSING_KEY_MESSAGE);
    let remote = null;
    try {
      remote = await getRemote();
      return await remote.callTool(request.params, undefined, { timeout: CALL_TIMEOUT_MS, signal: extra.signal });
    } catch (error) {
      forgetRemote(error);
      const hint = remote && PAID_TOOLS.has(request.params.name) && mayHaveCharged(error) ? MAYBE_CHARGED_HINT : "";
      return errorResult(describeError(error) + hint);
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    if (!apiKey) return { prompts: catalog.prompts };
    try {
      const remote = await getRemote();
      return await remote.listPrompts(request.params, { timeout: LIST_TIMEOUT_MS });
    } catch (error) {
      forgetRemote(error);
      log(`listing prompts from the bundled catalog: ${describeError(error)}`);
      return { prompts: catalog.prompts };
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (!apiKey) throw new McpError(ErrorCode.InvalidRequest, MISSING_KEY_MESSAGE);
    try {
      const remote = await getRemote();
      return await remote.getPrompt(request.params, { timeout: LIST_TIMEOUT_MS });
    } catch (error) {
      forgetRemote(error);
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, describeError(error));
    }
  });

  return server;
}

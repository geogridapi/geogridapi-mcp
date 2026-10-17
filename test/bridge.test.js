import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  CALL_TIMEOUT_MS,
  MISSING_KEY_MESSAGE,
  catalogPrompts,
  catalogTools,
  createBridgeServer,
} from "../src/bridge.js";
import { resolveRemoteUrl } from "../src/remote.js";

const IMAGE_RESULT = {
  content: [
    { type: "text", text: "Average rank 4.3" },
    { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
  ],
};

function fakeRemote(overrides = {}) {
  const calls = [];
  return {
    calls,
    listTools: async (params, options) => {
      calls.push({ method: "listTools", params, options });
      return { tools: [catalogTools()[0]] };
    },
    callTool: async (params, schema, options) => {
      calls.push({ method: "callTool", params, options });
      return IMAGE_RESULT;
    },
    listPrompts: async () => ({ prompts: [catalogPrompts()[0]] }),
    getPrompt: async (params) => ({
      messages: [{ role: "user", content: { type: "text", text: `audit ${params.arguments.listing}` } }],
    }),
    ...overrides,
  };
}

async function connect({ apiKey, connectRemote }) {
  const server = createBridgeServer({ apiKey, connectRemote, version: "0.0.0-test" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return client;
}

test("without a key, introspection answers from the bundled catalog", async () => {
  const client = await connect({
    apiKey: undefined,
    connectRemote: () => assert.fail("must not connect without a key"),
  });

  const { tools } = await client.listTools();
  const { prompts } = await client.listPrompts();

  assert.equal(tools.length, catalogTools().length);
  assert.ok(tools.some((tool) => tool.name === "run_grid"));
  assert.equal(prompts.length, catalogPrompts().length);
  assert.match(client.getInstructions(), /find_business/);
});

test("without a key, a tool call explains how to get one", async () => {
  const client = await connect({ apiKey: undefined, connectRemote: () => assert.fail() });

  const result = await client.callTool({ name: "get_balance", arguments: {} });

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, MISSING_KEY_MESSAGE);
});

test("without a key, getting a prompt is refused", async () => {
  const client = await connect({ apiKey: undefined, connectRemote: () => assert.fail() });

  await assert.rejects(
    client.getPrompt({ name: "local_audit", arguments: { listing: "x", keyword: "y" } }),
    (error) => error instanceof McpError && error.code === ErrorCode.InvalidRequest,
  );
});

test("with a key, calls are relayed and the image comes back untouched", async () => {
  const remote = fakeRemote();
  const client = await connect({ apiKey: "gga_test_x", connectRemote: async () => remote });

  const { tools } = await client.listTools();
  const result = await client.callTool({ name: "get_grid", arguments: { grid_id: "g1" } });
  const prompt = await client.getPrompt({ name: "local_audit", arguments: { listing: "Joe's", keyword: "pizza" } });

  assert.deepEqual(tools.map((tool) => tool.name), [catalogTools()[0].name]);
  assert.deepEqual(result.content, IMAGE_RESULT.content);
  assert.equal(prompt.messages[0].content.text, "audit Joe's");
  const call = remote.calls.find((entry) => entry.method === "callTool");
  assert.deepEqual(call.params, { name: "get_grid", arguments: { grid_id: "g1" } });
  assert.equal(call.options.timeout, CALL_TIMEOUT_MS);
});

test("the remote session is opened once and reused", async () => {
  let connections = 0;
  const remote = fakeRemote();
  const client = await connect({
    apiKey: "gga_test_x",
    connectRemote: async () => {
      connections += 1;
      return remote;
    },
  });

  await client.listTools();
  await client.callTool({ name: "get_balance", arguments: {} });
  await client.callTool({ name: "get_balance", arguments: {} });

  assert.equal(connections, 1);
});

test("an unreachable server falls back to the catalog, then reconnects", async () => {
  let attempts = 0;
  const client = await connect({
    apiKey: "gga_test_x",
    connectRemote: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("fetch failed");
      return fakeRemote();
    },
  });

  const { tools } = await client.listTools();
  const result = await client.callTool({ name: "get_balance", arguments: {} });

  assert.equal(tools.length, catalogTools().length);
  assert.equal(result.isError, undefined);
  assert.equal(attempts, 2);
});

test("a rejected key is reported in plain words", async () => {
  const client = await connect({
    apiKey: "gga_live_revoked",
    connectRemote: async () => {
      throw new Error("Streamable HTTP error: Error POSTing to endpoint (HTTP 401): invalid_key");
    },
  });

  const result = await client.callTool({ name: "get_balance", arguments: {} });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /rejected the API key/);
});

test("a real 401 from the transport is reported as a rejected key", async () => {
  const client = await connect({
    apiKey: "gga_live_revoked",
    connectRemote: async () => { throw new StreamableHTTPError(401, "Error POSTing to endpoint: {}"); },
  });

  const result = await client.callTool({ name: "get_balance", arguments: {} });

  assert.match(result.content[0].text, /rejected the API key/);
});

test("a paid call that fails mid-flight warns before a retry, and long errors are cut", async () => {
  const remote = fakeRemote({ callTool: async () => { throw new Error(`fetch failed ${"x".repeat(1000)}`); } });
  const client = await connect({ apiKey: "gga_test_x", connectRemote: async () => remote });

  const paid = await client.callTool({ name: "run_grid", arguments: { query: "a", keyword: "b" } });
  const free = await client.callTool({ name: "get_balance", arguments: {} });

  assert.equal(paid.isError, true);
  assert.match(paid.content[0].text, /may already be running and charged/);
  assert.ok(paid.content[0].text.length < 500);
  assert.doesNotMatch(free.content[0].text, /charged/);
});

test("a call refused by the server carries no charge warning", async () => {
  const remote = fakeRemote({ callTool: async () => { throw new McpError(ErrorCode.InvalidParams, "keyword is required"); } });
  const client = await connect({ apiKey: "gga_test_x", connectRemote: async () => remote });

  const result = await client.callTool({ name: "run_grid", arguments: {} });

  assert.doesNotMatch(result.content[0].text, /charged/);
});

test("the remote URL must be HTTPS, except on localhost", () => {
  assert.equal(resolveRemoteUrl(undefined).href, "https://api.geogridapi.io/mcp");
  assert.equal(resolveRemoteUrl("http://localhost:3000/mcp").hostname, "localhost");
  assert.throws(() => resolveRemoteUrl("http://example.com/mcp"), /must use https/);
  assert.equal(resolveRemoteUrl("http://[::1]:3000/mcp").hostname, "[::1]");
  assert.throws(() => resolveRemoteUrl("not a url"), /not a valid URL/);
});

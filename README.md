# GeoGridAPI MCP server

[![test](https://github.com/geogridapi/geogridapi-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/geogridapi/geogridapi-mcp/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Ask your AI assistant where a business ranks on Google Maps, block by block.

This MCP server gives Claude, Cursor, VS Code, Windsurf and any MCP client the [GeoGridAPI](https://geogridapi.io) tools: it measures a Google Business Profile for a keyword on every point of a grid around it (a local SEO "geo-grid"), then returns the rank map as an image, the competitors ranking ahead and the change since the last measure.

> "Run a 7×7 grid for Joe's Pizza in New York on *pizza*, then tell me who beats them in the north-east."

It runs locally over stdio and relays every call to the hosted server at `https://api.geogridapi.io/mcp`, so tools stay in sync with the API.

## Quick start

1. Create an account on [geogridapi.io](https://geogridapi.io/en/signup): 500 free credits, no card.
2. Create an API key in the console. `gga_test_` keys are free and return sample grids; `gga_live_` keys measure real grids (1 credit = 1 grid point).
3. Add the server to your client (Node.js 20 or later):

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`), **Windsurf**, **Cline**:

```json
{
  "mcpServers": {
    "geogridapi": {
      "command": "npx",
      "args": ["-y", "geogridapi-mcp"],
      "env": { "GEOGRIDAPI_API_KEY": "gga_live_…" }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add geogridapi --env GEOGRIDAPI_API_KEY=gga_live_… -- npx -y geogridapi-mcp
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "geogridapi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "geogridapi-mcp"],
      "env": { "GEOGRIDAPI_API_KEY": "gga_live_…" }
    }
  }
}
```

**Docker**:

```bash
docker build -t geogridapi-mcp https://github.com/geogridapi/geogridapi-mcp.git
docker run -i --rm -e GEOGRIDAPI_API_KEY=gga_live_… geogridapi-mcp
```

Your client supports remote servers? You can skip this package and connect straight to `https://api.geogridapi.io/mcp`, with OAuth (Claude, ChatGPT) or an `Authorization: Bearer` header. See the [MCP documentation](https://geogridapi.io/en/docs#mcp).

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `find_business` | Finds a Google Business Profile by name and city, returns its `place_id`. | Free |
| `estimate_grid` | Exact points and credits of a grid before running it. | Free |
| `run_grid` | Measures a listing for a keyword on a grid: square 3×3, 5×5, 7×7 or 9×9, or circle, diamond, hexagon, cross, ellipse, rectangle. Returns the rank map image, average rank, top 3 coverage and competitors ahead. | 1 credit per point |
| `run_grids` / `get_batch` | Up to 50 grids in one call: one listing with several keywords, or several listings with one keyword. | 1 credit per point |
| `get_grid` | A grid with its rank matrix, image, competitors and change since the previous one. | Free |
| `list_grids` | Past grids, filtered by listing or keyword. | Free |
| `get_history` | Ranking trend of the same map over time. | Free |
| `schedule_grid`, `list_schedules`, `update_schedule`, `delete_schedule` | Reruns a grid every week or every month. | 1 credit per point per run |
| `get_balance` | Credits left. | Free |

Six prompts come with it: local visibility audit, who ranks ahead, several keywords, ranking trend, track my listing and client report.

Ranks are positions in the Google Maps results at each grid point: lower is better, `null` means not in the top 20.

## Configuration

| Variable | Default | |
|---|---|---|
| `GEOGRIDAPI_API_KEY` | none | Required for tool calls. Without it the server still lists its tools. |
| `GEOGRIDAPI_MCP_URL` | `https://api.geogridapi.io/mcp` | Hosted server to relay to. |

## Development

```bash
npm install
npm test                                        # unit tests, no network
GEOGRIDAPI_API_KEY=gga_test_… npm run smoke     # end-to-end over stdio, free
GEOGRIDAPI_API_KEY=gga_test_… npm run sync-catalog  # refresh the offline tool catalog
```

## Related

- [local-rank-heatmap](https://github.com/geogridapi/local-rank-heatmap): one command, one Google Maps rank heatmap.
- [n8n-nodes-geogridapi](https://github.com/geogridapi/n8n-nodes-geogridapi): the GeoGridAPI node for n8n.
- [API documentation](https://geogridapi.io/en/docs) and [pricing](https://geogridapi.io/en#pricing).

## License

[MIT](LICENSE) © Localnord, LLC (GeoGridAPI)

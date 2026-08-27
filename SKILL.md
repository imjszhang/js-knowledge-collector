---
name: js-knowledge-collector
description: URL-to-knowledge pipeline — scrape web pages, AI-summarize, store in SQLite, export and browse.
version: 1.0.0
metadata:
  openclaw:
    emoji: "\U0001F4DA"
    homepage: https://github.com/user/js-knowledge-collector
    os:
      - windows
      - macos
      - linux
    requires:
      bins:
        - node
---

# JS Knowledge Collector

A URL-to-knowledge-base pipeline that scrapes web pages, generates AI summaries, stores articles in SQLite, and provides browsing / export / memory-sync capabilities.

## First Step: Detect Runtime Mode

Before performing any operation, detect whether this project is running as an **OpenClaw plugin** or in **standalone CLI mode**. The result determines configuration paths, command prefixes, and available features.

### Detection Steps

#### Step 0 — OS & Environment Variable Probe

First detect the current operating system to choose the correct shell commands, then check OpenClaw-related environment variables:

**OS Detection:**

| Check | Windows | macOS / Linux |
|-------|---------|---------------|
| OS identification | `echo %OS%` or `$env:OS` (PowerShell) | `uname -s` |
| Home directory | `%USERPROFILE%` | `$HOME` |
| Default OpenClaw state dir | `%USERPROFILE%\.openclaw\` | `~/.openclaw/` |
| Default config path | `%USERPROFILE%\.openclaw\openclaw.json` | `~/.openclaw/openclaw.json` |

**Environment Variable Check:**

```bash
# Windows (PowerShell)
Get-ChildItem Env: | Where-Object { $_.Name -match '^OPENCLAW_' }

# Windows (CMD / Git Bash)
set | grep -iE "^OPENCLAW_"

# macOS / Linux
env | grep -iE "^OPENCLAW_"
```

| Variable | Meaning if set |
|----------|---------------|
| `OPENCLAW_CONFIG_PATH` | Direct path to config file (e.g. `D:\.openclaw\openclaw.json`) — **highest priority**, use as-is |
| `OPENCLAW_STATE_DIR` | OpenClaw state directory (e.g. `D:\.openclaw`) — config file at `$OPENCLAW_STATE_DIR/openclaw.json` |
| `OPENCLAW_HOME` | Custom home directory (e.g. `D:\`) — state dir resolves to `$OPENCLAW_HOME/.openclaw/` |

**OpenClaw config file resolution order** (first match wins):

1. `OPENCLAW_CONFIG_PATH` is set → use that file directly
2. `OPENCLAW_STATE_DIR` is set → `$OPENCLAW_STATE_DIR/openclaw.json`
3. `OPENCLAW_HOME` is set → `$OPENCLAW_HOME/.openclaw/openclaw.json`
4. None set → default `~/.openclaw/openclaw.json` (Windows: `%USERPROFILE%\.openclaw\openclaw.json`)

Use the resolved config path in all subsequent steps.

#### Step 1 — OpenClaw Binary Detection

1. Check if `openclaw` command exists on PATH (Windows: `where openclaw`, macOS/Linux: `which openclaw`)
2. If exists, read the OpenClaw config file (path resolved by Step 0) and look for `js-knowledge-collector` in `plugins.entries` with `enabled: true`
3. Verify that `plugins.load.paths` contains a path pointing to this project's `openclaw-plugin/` directory

If **all three checks pass** → use **OpenClaw Plugin Mode**. Otherwise → use **Standalone CLI Mode**.

### Mode Comparison

| Aspect | OpenClaw Plugin Mode | Standalone CLI Mode |
|--------|---------------------|-------------------|
| Configuration | `~/.openclaw/openclaw.json` → `plugins.entries.js-knowledge-collector.config` | `.env` |
| Command prefix | `openclaw knowledge <cmd>` | `node cli/cli.js <cmd>` |
| AI tools | `knowledge_*` (7 tools via OpenClaw Agent) | Not available (use CLI) |
| Cron auto-collect | `openclaw knowledge setup-collector` | Not available |
| Link queue | `.openclaw/link-collector/inbox.jsonl` (via link-collector skill) | Not available |
| Web UI | `http://<host>/plugins/js-knowledge/` | `node cli/cli.js serve` (localhost only) |
| Memory sync | Automatic background service (configurable interval) | Not available |

### OpenClaw Plugin Mode

When the plugin is deployed:

- **CLI**: always use `openclaw knowledge ...` instead of `node cli/cli.js ...`
- **AI tools**: prefer `knowledge_*` tools when invoked from an OpenClaw Agent session
- **Config**: modify `~/.openclaw/openclaw.json` for LLM API, database path, Flomo, memory sync, etc.; do NOT edit `.env` for plugin-managed settings
- **Link collection**: use the link-collector skill — drop URLs in chat, they queue automatically and process via cron
- **Cron**: manage via `openclaw knowledge setup-collector`
- **Memory sync**: runs as a background service; configure `memorySyncEnabled`, `memorySyncDir`, `memorySyncIntervalMinutes` in plugin config

### Standalone CLI Mode

When running without OpenClaw:

- **CLI**: use `node cli/cli.js <cmd>`
- **Config**: `.env` for API credentials and database path (see environment variable table below)
- **No cron / link queue** features — run `collect` manually per URL
- **No AI tools** — all interaction through CLI commands
- **No memory sync** — use `export` to manually export articles

---

## Deployment Probe

After detecting the runtime mode, run the following diagnostic steps to build a complete picture of the local deployment. Execute these in order; skip remaining steps if an earlier step indicates OpenClaw is unavailable.

> **Prerequisite**: Step 0 (OS & Environment Variable Probe) from the Detection Steps above must have already been executed. Use the detected OS to choose correct commands, and use `$OPENCLAW_HOME/openclaw.json` if `OPENCLAW_HOME` is set, otherwise `~/.openclaw/openclaw.json`.

### Step 1 — OpenClaw Availability

- Windows: `where openclaw` / macOS & Linux: `which openclaw`
- If found: `openclaw --version` to confirm the installed version
- If environment variable probe found relevant `LLM_API_*` / `DB_PATH` variables already set, note them — they will be used as fallback in standalone mode

### Step 2 — Plugin Load Status

Read the OpenClaw config file (path determined by Step 0) and check:

- `plugins.load.paths` — does it include a path pointing to this project's `openclaw-plugin/` directory?
- `plugins.entries["js-knowledge-collector"].enabled` — is the plugin enabled?
- `plugins.entries["js-knowledge-collector"].config` — extract `dbPath`, `llmApiBaseUrl`, `llmApiModel` for a quick config snapshot

### Step 3 — Database Health

If `remoteDbEnabled` + `remoteDbBaseUrl` (or `REMOTE_DB_ENABLED` + `REMOTE_DB_BASE_URL`) are set, this instance is a **client** and the LAN collector is the canonical store:

- `curl http://<remote-host>:3000/api/v1/health.json` should return `{ "status": "ok", "mode": "local", "total": N }`
- Then run `knowledge_stats` / `node cli/cli.js stats` — they read the remote store

Otherwise check the local SQLite file:

- Plugin mode: resolve path from `plugins.entries["js-knowledge-collector"].config.dbPath` (default: `{projectRoot}/data/data.db`)
- Standalone mode: `DB_PATH` env var or `./data/data.db`
- Run `knowledge_stats` or `node cli/cli.js stats` to verify the database is readable

### Step 4 — Cron Job Status (Plugin Mode Only)

```bash
openclaw cron list --json
```

Look for one job by name:

| Job Name | Purpose |
|----------|---------|
| `link-collector-process` | Periodically processes queued links through scrape → summarize → store pipeline |

If the job is missing, the link-collector auto-processing is not configured. See the Runbook section for setup instructions.

### Step 5 — Memory Sync Status (Plugin Mode Only)

Check if memory sync is active:

- Plugin config: `memorySyncEnabled` (default `true`), `memorySyncDir` (default `work_dir/memory-export/`)
- Verify the export directory exists and contains `.md` files
- Check that `openclaw.json` → `agents.defaults.memorySearch.extraPaths` includes the export directory

### Step 6 — Link Queue Health (Plugin Mode Only)

Inspect `{workspace}/.openclaw/link-collector/`:

| File / Directory | Healthy State | Unhealthy Signal |
|-----------------|---------------|-----------------|
| `inbox.jsonl` | Empty or contains `pending` entries | Missing → auto-created on first use |
| `batch-*.jsonl` | Absent | Present → previous cron run did not complete (crash recovery pending) |
| `archive/` | Contains completed batches | Not a concern; safe to clean up for disk space |
| `config.json` | Optional | Missing is fine (defaults apply) |

---

## Config Files Map

| File | Typical Path | Purpose | How to Modify |
|------|-------------|---------|--------------|
| `openclaw.json` | `~/.openclaw/openclaw.json` | Main config: LLM API, DB path, Flomo, memory sync, plugin registration | Edit JSON directly |
| `.env` | `{projectRoot}/` | Standalone mode config: API keys, DB path, JS-Eyes URL | Copy from `.env.example`, edit values |
| `openclaw.plugin.json` | `{projectRoot}/openclaw-plugin/` | Plugin manifest: config schema, UI hints | Generally not edited by users |
| `config.json` | `{workspace}/.openclaw/link-collector/` | Link collector defaults (e.g. `defaultFlomo`) | Edit JSON directly or via chat |
| `inbox.jsonl` | `{workspace}/.openclaw/link-collector/` | Link collection queue (append-only) | Auto-managed; safe to truncate (clears queue) |

`{workspace}` resolves from `openclaw.json`: `agents.defaults.workspace` → `agents.list[0].workspace` → `process.cwd()`.

`{projectRoot}` is the directory where this project is cloned / installed.

---

## Action Priority

When performing an operation, always prefer the highest-priority method available:

> **OpenClaw AI Tool → OpenClaw CLI (`openclaw knowledge ...`) → Standalone CLI (`node cli/cli.js ...`) / file edit**

| Scenario | Preferred | Fallback | Last Resort |
|----------|-----------|----------|-------------|
| Collect a URL | `knowledge_collect`（自动入队，非阻塞） | `openclaw knowledge collect <url>` | `node cli/cli.js collect <url>` |
| Search articles | `knowledge_search` | `openclaw knowledge search <kw>` | `node cli/cli.js search <kw>` |
| List articles | `knowledge_list` | `openclaw knowledge list` | `node cli/cli.js list` |
| View article | `knowledge_get` | — | `node cli/cli.js list` (no direct get in CLI) |
| View stats | `knowledge_stats` | `openclaw knowledge stats` | `node cli/cli.js stats` |
| Delete article | `knowledge_delete` | — | `node cli/cli.js delete <id>` |
| Export articles | `knowledge_export` | — | `node cli/cli.js export --format <fmt>` |
| Queue a link | Drop URL in chat (link-collector skill) | — | `node cli/cli.js collect <url>` |
| Setup cron | `openclaw knowledge setup-collector` | — | N/A |
| Memory sync | Automatic (background service) | `openclaw knowledge sync` | N/A |
| Change LLM / API | Edit `~/.openclaw/openclaw.json` plugin config | Edit `.env` | N/A |

---

## Runbook

### "Collect this URL for me"

1. **Plugin mode (Agent)**: call `knowledge_collect` — it enqueues instantly without blocking the session.
2. **Priority**: pass `priority: true` when user asks for immediate collection.
3. **Immediate sync (debug)**: `openclaw knowledge collect <url>` from terminal (not in main Agent session).
4. **Standalone mode**: `node cli/cli.js collect <url>`

### "Cron doesn't seem to be running"

1. `openclaw cron list --json` — check if `link-collector-process` job exists
2. Missing → `openclaw knowledge setup-collector`
3. Present → check `inbox.jsonl` for stale `pending` entries and `batch-*.jsonl` for incomplete batches

### "Switch model / API endpoint"

1. Edit `~/.openclaw/openclaw.json` → `plugins.entries["js-knowledge-collector"].config` (change `llmApiBaseUrl`, `llmApiModel`, or `llmApiKey`)
2. No restart needed — next tool call picks up the new config automatically
3. Standalone mode: edit `.env` (`LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_API_MODEL`)

### "Memory sync isn't working"

1. Check plugin config: `memorySyncEnabled` should be `true`
2. Run `openclaw knowledge sync` manually to force a sync
3. Verify the export directory (`memorySyncDir` or default `work_dir/memory-export/`) contains `.md` files
4. Ensure `openclaw.json` → `agents.defaults.memorySearch.extraPaths` includes the export directory path

### "Link queue is stuck / crash recovery"

1. Check `{workspace}/.openclaw/link-collector/` for `batch-*.jsonl`
2. Present → next cron trigger resumes from the checkpoint automatically
3. To abandon the batch → delete the `batch-*.jsonl` file; next run starts fresh from inbox
4. Inspect `inbox.jsonl` for `permanently_failed` entries (retries >= 3)

### "Export articles"

1. `knowledge_export` with `format`: `prism` (Markdown journals for Knowledge Prism), `json`, or `md`
2. Use `force: true` for full re-export (ignoring incremental state)

---

## What it does

Knowledge Collector provides an end-to-end URL-to-knowledge pipeline:

1. **Scrape** — fetch web content from 10+ platforms (WeChat, Zhihu, Xiaohongshu, Jike, X.com, Reddit, Bilibili, YouTube, GitHub, and generic pages)
2. **Summarize** — three-stage AI summarization (overview → digest → recommendation) via OpenAI-compatible API
3. **Store** — persist articles with metadata in SQLite
4. **Export** — output as Prism journals, JSON, or Markdown
5. **Browse** — Neo-Brutalism-styled web UI for searching and reading collected articles

For platforms requiring JavaScript rendering (WeChat, Xiaohongshu, etc.), it connects to a JS-Eyes browser automation service via WebSocket.

## Architecture

```
URL → Scraper (HTTP / JS-Eyes) → AI Summarizer (overview/digest/recommendation)
                                       ↓
                         SQLite（正库机）或 HTTP → 局域网正库
                                       ↓
                          ┌────────────┼────────────┐
                          ↓            ↓            ↓
                     Web UI       Export         Memory Sync
                  (browse/search) (prism/json/md) (Markdown → memory_search)
```

The OpenClaw plugin wraps all CLI functionality as AI tools and HTTP routes, adds a link-collector skill for asynchronous queue-based collection, and provides automatic memory synchronization.

## Provided AI Tools

| Tool | Description |
|------|-------------|
| `knowledge_collect` | 将 URL/本地路径加入收集队列（非阻塞）；批处理由 cron `process-inbox` 完成 |
| `knowledge_search` | Search articles by keyword, optionally filter by platform |
| `knowledge_list` | List articles with pagination, platform filter, and sorting |
| `knowledge_get` | Get full article detail by ID (content, summary, recommendation) |
| `knowledge_stats` | Knowledge base statistics: total count, per-platform distribution |
| `knowledge_delete` | Delete an article by ID |
| `knowledge_export` | Export articles in prism / json / md format |

## CLI Commands

### OpenClaw Plugin Mode

```
openclaw knowledge stats                        View knowledge base statistics
openclaw knowledge list [--source <plat>]        List articles
openclaw knowledge search <keyword>              Search articles
openclaw knowledge collect <url> [--flomo]       Scrape + summarize + store
openclaw knowledge sync [--force] [--dir <path>] Sync to memory system
openclaw knowledge process-inbox                 Process link queue (cron entry)
openclaw knowledge setup-collector [--every N]   Configure command cron for link queue
```

### Standalone CLI Mode

```
node cli/cli.js collect <url>      Scrape, summarize, and save
  --flomo                            Also send summary to Flomo
  --no-summary                       Scrape only, skip AI summary
  --force                            Force re-scrape (ignore cache)
  --force-summary                    Force re-summarize only
  --download-media                   Download images/videos to work_dir/scrape/<platform>/<id>/

X.com scrape output (with --download-media):
  work_dir/scrape/x_com/<user>_status_<id>/data.json   metadata + media_files[]
  work_dir/scrape/x_com/<user>_status_<id>/photo_1.jpg  downloaded photos
  work_dir/scrape/x_com/<user>_status_<id>/video_1.mp4  downloaded mp4 (m3u8 needs ffmpeg)

node cli/cli.js search <keyword>   Search articles
  --source <platform>                Filter by platform

node cli/cli.js list               List articles
  --source <platform>                Filter by platform
  --page <N>                         Page number (default 1)
  --per-page <N>                     Items per page (default 20)
  --sort <field>                     Sort field, prefix - for DESC

node cli/cli.js stats              Collection statistics
node cli/cli.js delete <id>        Delete article by ID

node cli/cli.js export             Export articles
  --format <fmt>                     prism | json | md (default json)
  --force                            Full re-export

node cli/cli.js build              Build static site to docs/
  --dry-run                          Validate only

node cli/cli.js serve              Start HTTP server (default port 3000)
node cli/cli.js commit             Stage + commit changes
node cli/cli.js sync               Commit + push
  --no-push                          Skip push step
```

## Web UI

The plugin registers HTTP routes on the OpenClaw gateway:

| Route | Description |
|-------|-------------|
| `/plugins/js-knowledge/` | Knowledge browser — search, filter, paginate collected articles |
| `/plugins/js-knowledge/api/v1/articles.json` | JSON API — article list (GET; `sourceUrl` exact match, `full=1` includes content) or create (POST, Bearer token) |
| `/plugins/js-knowledge/api/v1/articles/{id}.json` | JSON API — single article detail (GET) or delete (DELETE) |
| `/plugins/js-knowledge/api/v1/stats.json` | JSON API — collection statistics |
| `/plugins/js-knowledge/api/v1/health.json` | JSON API — store health (`status`, `mode`, `total`) |

Access the browser at `http://<openclaw-host>/plugins/js-knowledge/` after the plugin is loaded.

In standalone mode, run `node cli/cli.js serve` to start the same UI on `http://localhost:3000`.

## Skill Bundle Structure

```
js-knowledge-collector/
├── SKILL.md                              ← Skill entry point (this file)
├── package.json                          ← Root package (ESM, Node ≥ 18)
├── .env.example                          ← Environment variable template
├── build/
│   └── build.js                          ← Static site builder (src → docs + API JSON)
├── cli/
│   ├── cli.js                            ← CLI entry point
│   └── lib/
│       ├── collector.js                  ← Collection pipeline (scrape → summarize → store)
│       ├── db-config.js                  ← Local SQLite vs remote HTTP store
│       ├── http-database.js              ← HTTP client for a LAN canonical collector
│       ├── api-auth.js                   ← Bearer token helpers for POST
│       ├── article-api.js                ← Shared REST handlers (list/create/health)
│       ├── scraper.js                    ← Web scraping (HTTP + JS-Eyes dispatch)
│       ├── scraper-bilibili.js           ← Bilibili-specific scraper
│       ├── scraper-youtube.js            ← YouTube-specific scraper
│       ├── web-scraper.js                ← Generic HTTP scraper
│       ├── browser-automation.js         ← JS-Eyes browser automation driver
│       ├── browser-extensions/           ← Platform-specific browser scripts
│       │   ├── index.js                  ← Extension registry
│       │   ├── common.js                 ← Common extraction logic
│       │   ├── wechat.js                 ← WeChat article extraction
│       │   └── xcom.js                   ← X.com tweet extraction
│       ├── summarizer.js                 ← AI three-stage summarization
│       ├── llm.js                        ← OpenAI-compatible LLM client
│       ├── database.js                   ← SQLite database operations
│       ├── data-reader.js                ← Read-only data queries
│       ├── exporter.js                   ← Export (prism / json / md)
│       ├── memory-sync.js                ← Memory sync (SQLite → Markdown)
│       ├── server.js                     ← HTTP server (static + REST API)
│       ├── js-eyes-client.js             ← JS-Eyes WebSocket client
│       ├── flomo.js                      ← Flomo webhook push
│       ├── git.js                        ← Git operations (commit, push)
│       └── formatters.js                 ← Output formatting utilities
├── openclaw-plugin/
│   ├── openclaw.plugin.json              ← Plugin manifest (config schema, UI hints)
│   ├── package.json                      ← ESM module descriptor
│   ├── index.mjs                         ← Plugin logic — 7 AI tools + CLI + HTTP routes + services
│   └── skills/
│       └── link-collector/
│           ├── SKILL.md                  ← Link collector skill (queue + cron batch processing)
│           └── references/
│               └── link-format.md        ← JSONL entry format specification
├── prompts/
│   ├── summary.txt                       ← AI summary prompt
│   ├── digest.txt                        ← AI digest prompt
│   └── recommendation.txt                ← AI recommendation prompt
├── src/
│   ├── index.html                        ← Knowledge browser UI (Tailwind + Marked.js)
│   ├── skill.json                        ← Capability descriptor
│   └── skill.md                          ← Brief skill description
└── work_dir/                             ← Runtime directory (.gitignored)
    └── memory-export/                    ← Memory sync Markdown output
```

> `openclaw-plugin/index.mjs` imports from `../cli/lib/` via relative paths, so the directory layout must be preserved.

## Supported Platforms

| Platform | Source Key | Scrape Method |
|----------|-----------|---------------|
| 微信公众号 | `wechat` | JS-Eyes (browser) |
| 知乎 | `zhihu` | HTTP |
| 小红书 | `xiaohongshu` | JS-Eyes (browser) |
| 即刻 | `jike` | HTTP |
| X.com | `x_com` | JS-Eyes (browser) |
| Reddit | `reddit` | HTTP |
| Bilibili | `bilibili` | HTTP (dedicated scraper) |
| YouTube | `youtube` | HTTP (dedicated scraper) |
| GitHub | `github` | HTTP |
| 通用网页 | `general` | HTTP (Cheerio) |

## Prerequisites

- **Node.js** >= 18
- An **OpenAI-compatible API** endpoint (for AI summarization)
- **JS-Eyes** browser automation service (optional, required for WeChat / Xiaohongshu / X.com)

## Install

### Option A — As OpenClaw Plugin (recommended)

1. Clone or download the project
2. Run `npm install` in the project directory
3. Register the plugin (see below)

### Option B — Standalone CLI

1. Clone or download the project
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your configuration
4. Run `node cli/cli.js help` to see available commands

### Register the Plugin

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/js-knowledge-collector/openclaw-plugin"]
    },
    "entries": {
      "js-knowledge-collector": {
        "enabled": true,
        "config": {
          "llmApiBaseUrl": "http://localhost:8888/v1",
          "llmApiModel": "your-model",
          "llmApiKey": "your-key"
        }
      }
    }
  }
}
```

Restart OpenClaw to load the plugin.

## Plugin Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbPath` | string | `data/data.db` | Local SQLite path (canonical store on the LAN server) |
| `remoteDbEnabled` | boolean | `false` | Use another knowledge-collector on the LAN as the canonical store |
| `remoteDbBaseUrl` | string | — | Remote HTTP origin, e.g. `http://192.168.1.20:3000` |
| `remoteDbApiPrefix` | string | `/api/v1` | `/api/v1` for standalone `serve`; `/plugins/js-knowledge/api/v1` for an OpenClaw gateway |
| `remoteDbToken` | string | — | Bearer token sent on remote writes; must match the server `apiToken` |
| `apiToken` | string | — | Token required for `POST /api/v1/articles.json` when this machine is the canonical store |
| `llmApiBaseUrl` | string | — | OpenAI-compatible API endpoint |
| `llmApiKey` | string | — | API key |
| `llmApiModel` | string | `gpt-4.1-mini` | Model name |
| `flomoWebhookUrl` | string | — | Flomo webhook URL (empty = disabled) |
| `serverPort` | number | `3000` | Built-in HTTP server port |
| `autoStartServer` | boolean | `false` | Auto-start HTTP server on plugin load |
| `memorySyncEnabled` | boolean | `true` | Enable knowledge → memory Markdown export |
| `memorySyncDir` | string | `work_dir/memory-export/` | Memory sync Markdown output directory |
| `memorySyncIntervalMinutes` | number | `10` | Periodic sync interval (minutes); 0 = sync only on collect/delete |

### Environment Variables (Standalone Mode)

| Variable | Description |
|----------|-------------|
| `JS_EYES_WS_URL` | JS-Eyes WebSocket URL (default `ws://localhost:18080`) |
| `LLM_API_BASE_URL` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | LLM API key |
| `LLM_API_MODEL` | LLM model name |
| `FLOMO_API_URL` | Flomo webhook URL |
| `DB_PATH` | Local SQLite path (default `./data/data.db`) |
| `API_TOKEN` | Bearer token protecting POST writes on the canonical server |
| `REMOTE_DB_ENABLED` | `true` to use a LAN collector as the canonical store |
| `REMOTE_DB_BASE_URL` | Remote HTTP origin, e.g. `http://192.168.1.20:3000` |
| `REMOTE_DB_API_PREFIX` | Default `/api/v1` |
| `REMOTE_DB_TOKEN` | Bearer token matching the remote `API_TOKEN` |

## Verify

```bash
# Plugin mode
openclaw knowledge stats

# Standalone mode
node cli/cli.js stats
```

Expected output:

```
=== 知识库统计 ===
  文章总数: 42
  平台分布:
    - wechat: 15
    - zhihu: 8
    - github: 7
    - bilibili: 5
    - xiaohongshu: 4
    - x_com: 3
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SQLITE_CANTOPEN` | Database path invalid or directory missing | Check `dbPath` / `DB_PATH`; ensure `data/` directory exists |
| 远程知识库超时 / 连接失败 | LAN collector unreachable | Check `remoteDbBaseUrl`, firewall, and `curl .../api/v1/health.json` |
| 远程知识库鉴权失败 (401) | Token mismatch or missing | Align `remoteDbToken` / `REMOTE_DB_TOKEN` with the server `apiToken` / `API_TOKEN` |
| 正库未配置 API_TOKEN，拒绝写入 | Canonical server has no write token | Set `API_TOKEN` (standalone) or `apiToken` (plugin) on the LAN server |
| LLM timeout / connection refused | API unreachable | Check `llmApiBaseUrl` and network; verify API key is valid |
| Empty summary after collect | LLM returned empty response | Check prompt files in `prompts/`; try a different model |
| WeChat/Xiaohongshu scrape fails | JS-Eyes not running | Start JS-Eyes service; check `JS_EYES_WS_URL` |
| Tools not appearing in OpenClaw | Plugin path wrong | Ensure path in `plugins.load.paths` points to `openclaw-plugin/` subdirectory |
| Memory sync not working | Export dir not in `memorySearch.extraPaths` | Add `memorySyncDir` path to `openclaw.json` → `agents.defaults.memorySearch.extraPaths` |
| Cron not processing links | Job not configured | Run `openclaw knowledge setup-collector` |

## Security

This skill only communicates with **user-configured** LLM API endpoints, the **user-configured** JS-Eyes service, and (when enabled) a **user-configured** LAN knowledge-collector HTTP API. It does not call any other external APIs, collect telemetry, or transmit user data. Article content is stored in local SQLite on the canonical machine, or written to that machine over HTTP when this instance is a client. Flomo push is opt-in and uses the user's own webhook URL. `POST /api/v1/articles.json` requires a Bearer token (`API_TOKEN` / `apiToken`).

## Remote knowledge base (LAN canonical store)

Two machines run the same project. The LAN server keeps the SQLite file and exposes HTTP; this machine scrapes/summarizes and reads/writes remotely.

**Canonical server** (do not enable `remoteDb*`):

1. Set `API_TOKEN` (standalone) or plugin `apiToken`.
2. Run `node cli/cli.js serve` (or plugin `autoStartServer`) and open the port on the LAN.
3. Confirm `GET /api/v1/health.json`.

**Client**:

1. Set `remoteDbEnabled` + `remoteDbBaseUrl` + `remoteDbToken` (or the `REMOTE_DB_*` env vars).
2. Prefer `remoteDbApiPrefix=/api/v1` against standalone `serve`.
3. Collect/search/list/delete/export/memory-sync all go to the remote store. Local `data.db` is not the primary database.
4. Remote failures are surfaced as errors — they do not fall back to the local file.
5. `--download-media` local file paths in `cover_url` are not uploaded; keep original remote image URLs when possible.

## Extension Skills

Knowledge Collector includes bundled skills in `openclaw-plugin/skills/`:

| Skill | Description |
|-------|-------------|
| **link-collector** | Queue-based link collection — enqueue URLs from chat, cron batch processing with crash recovery and retry |

> **Design principle**: The link-collector skill separates collection (fast, non-blocking enqueue via `knowledge_collect` tool) from processing (slow scrape+summarize pipeline via `openclaw knowledge process-inbox` command cron), ensuring the main conversation is never blocked.

## Links

- Source: https://github.com/user/js-knowledge-collector
- License: MIT

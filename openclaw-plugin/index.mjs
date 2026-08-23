import nodePath from "node:path";
import nodeFs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = nodePath.resolve(__dirname, "..");
const SRC_DIR = nodePath.join(PROJECT_ROOT, "src");

const ROUTE_PREFIX = "/plugins/js-knowledge";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function applyEnv(pluginCfg) {
  // dbPath 不写入 process.env.DB_PATH — 避免被 js-knowledge-flomo 等同进程插件覆盖
  if (pluginCfg.llmApiBaseUrl) process.env.LLM_API_BASE_URL = pluginCfg.llmApiBaseUrl;
  if (pluginCfg.llmApiKey) process.env.LLM_API_KEY = pluginCfg.llmApiKey;
  if (pluginCfg.llmApiModel) process.env.LLM_API_MODEL = pluginCfg.llmApiModel;
  if (pluginCfg.flomoWebhookUrl) process.env.FLOMO_API_URL = pluginCfg.flomoWebhookUrl;
}

function resolveCollectorDbPath(pluginCfg) {
  if (pluginCfg.dbPath) return nodePath.resolve(pluginCfg.dbPath);
  return nodePath.join(PROJECT_ROOT, "data", "data.db");
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function jsonResult(data) {
  return textResult(JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  });
  res.end(payload);
}

function serveStaticFile(res, filePath) {
  const ext = nodePath.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const stream = nodeFs.createReadStream(filePath);
  stream.on("error", () => {
    if (res.headersSent) {
      res.end();
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    }
  });
  res.writeHead(200, { "Content-Type": mime });
  stream.pipe(res);
}

async function getDb(dbPath) {
  const Database = (await import("../cli/lib/database.js")).default;
  const db = new Database(dbPath);
  await db.connect();
  return db;
}

export default function register(api) {
  // Load project-local .env first (override: false → won't clobber existing env vars)
  dotenv.config({ path: nodePath.join(PROJECT_ROOT, ".env"), override: false });

  const pluginCfg = api.pluginConfig ?? {};
  const collectorDbPath = resolveCollectorDbPath(pluginCfg);
  const defaultFlomo = pluginCfg.defaultFlomo ?? true;
  const collectorWorkspace = pluginCfg.workspace
    ? nodePath.resolve(pluginCfg.workspace)
    : undefined;

  const serverPort = pluginCfg.serverPort || 3000;
  const autoStart = pluginCfg.autoStartServer ?? false;

  const memorySyncEnabled = pluginCfg.memorySyncEnabled ?? true;
  const memorySyncDir = pluginCfg.memorySyncDir
    ? nodePath.resolve(pluginCfg.memorySyncDir)
    : nodePath.join(PROJECT_ROOT, "work_dir", "memory-export");
  const memorySyncIntervalMinutes = pluginCfg.memorySyncIntervalMinutes ?? 10;

  // openclaw.json pluginConfig values take precedence over .env
  applyEnv(pluginCfg);

  let serverInstance = null;

  /**
   * Fire-and-forget incremental memory sync.
   * Shared by the background service, tool hooks, and CLI.
   */
  async function runMemorySync({ force = false, logger } = {}) {
    try {
      const { syncToMemory } = await import("../cli/lib/memory-sync.js");
      return await syncToMemory({ dbPath: collectorDbPath, outputDir: memorySyncDir, force });
    } catch (err) {
      if (logger) logger.error(`[knowledge] memory sync failed: ${err.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Service: knowledge-collector-server (standalone, optional)
  // ---------------------------------------------------------------------------

  api.registerService({
    id: "knowledge-collector-server",
    async start(ctx) {
      if (!autoStart) {
        ctx.logger.info("[knowledge] autoStartServer=false, skipping standalone server");
        return;
      }
      try {
        const { startServer } = await import("../cli/lib/server.js");
        serverInstance = await startServer({ port: serverPort });
        ctx.logger.info(`[knowledge] Standalone server started on http://localhost:${serverPort}`);
      } catch (err) {
        ctx.logger.error(`[knowledge] Failed to start standalone server: ${err.message}`);
        serverInstance = null;
      }
    },
    async stop(ctx) {
      if (serverInstance) {
        try {
          if (typeof serverInstance.close === "function") serverInstance.close();
        } catch {}
        serverInstance = null;
      }
      ctx.logger.info("[knowledge] Service stopped");
    },
  });

  // ---------------------------------------------------------------------------
  // Service: knowledge-memory-sync (background, enabled by default)
  // ---------------------------------------------------------------------------

  let memorySyncTimer = null;

  api.registerService({
    id: "knowledge-memory-sync",
    async start(ctx) {
      if (!memorySyncEnabled) {
        ctx.logger.info("[knowledge] memorySyncEnabled=false, skipping memory sync service");
        return;
      }

      ctx.logger.info(`[knowledge] Memory sync starting (dir=${memorySyncDir}, interval=${memorySyncIntervalMinutes}m)`);
      const result = await runMemorySync({ logger: ctx.logger });
      if (result) {
        ctx.logger.info(`[knowledge] Initial sync done: ${result.synced} synced, ${result.deleted} deleted, ${result.total} total`);
      }

      if (memorySyncIntervalMinutes > 0) {
        memorySyncTimer = setInterval(async () => {
          const r = await runMemorySync({ logger: ctx.logger });
          if (r && (r.synced > 0 || r.deleted > 0)) {
            ctx.logger.info(`[knowledge] Periodic sync: ${r.synced} synced, ${r.deleted} deleted`);
          }
        }, memorySyncIntervalMinutes * 60_000);
      }
    },
    async stop(ctx) {
      if (memorySyncTimer) {
        clearInterval(memorySyncTimer);
        memorySyncTimer = null;
      }
      ctx.logger.info("[knowledge] Memory sync service stopped");
    },
  });

  // ---------------------------------------------------------------------------
  // Gateway HTTP Routes: Web UI + REST API
  //
  // All routes live under /plugins/knowledge/
  //   GET  /plugins/knowledge/                          → index.html
  //   GET  /plugins/knowledge/<file>                    → static file from src/
  //   GET  /plugins/knowledge/api/v1/articles.json      → article list
  //   GET  /plugins/knowledge/api/v1/stats.json         → stats
  //   GET  /plugins/knowledge/api/v1/articles/{id}.json → article detail
  //   DELETE /plugins/knowledge/api/v1/articles/{id}.json → delete article
  // ---------------------------------------------------------------------------

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}`,
    auth: "plugin",
    async handler(req, res) {
      res.writeHead(301, { Location: `${ROUTE_PREFIX}/` });
      res.end();
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/`,
    auth: "plugin",
    async handler(req, res) {
      serveStaticFile(res, nodePath.join(SRC_DIR, "index.html"));
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/api/v1/articles.json`,
    auth: "plugin",
    async handler(req, res) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      const db = await getDb(collectorDbPath);
      try {
        const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const page = parseInt(parsed.searchParams.get("page"), 10) || 1;
        const perPage = parseInt(parsed.searchParams.get("perPage"), 10) || 12;
        const source = parsed.searchParams.get("source") || "";
        const keyword = parsed.searchParams.get("keyword") || "";
        const result = await db.getArticles({ page, perPage, source, keyword });
        sendJson(res, 200, { status: "success", ...result });
      } catch (err) {
        sendJson(res, 500, { status: "error", message: err.message });
      } finally {
        await db.close();
      }
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/api/v1/stats.json`,
    auth: "plugin",
    async handler(req, res) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      const db = await getDb(collectorDbPath);
      try {
        const stats = await db.getStats();
        sendJson(res, 200, stats);
      } catch (err) {
        sendJson(res, 500, { status: "error", message: err.message });
      } finally {
        await db.close();
      }
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/api/v1/articles`,
    auth: "plugin",
    match: "prefix",
    async handler(req, res) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const match = parsed.pathname.match(/\/articles\/([^/]+)\.json$/);
      if (!match) {
        sendJson(res, 404, { status: "error", message: "Not found" });
        return;
      }
      const id = match[1];
      const db = await getDb(collectorDbPath);
      try {
        if (req.method === "DELETE") {
          const result = await db.deleteRecord(id);
          sendJson(res, 200, result);
        } else {
          const record = await db.getRecord(id);
          if (!record) {
            sendJson(res, 404, { status: "error", message: "文章不存在" });
          } else {
            sendJson(res, 200, { status: "success", data: record });
          }
        }
      } catch (err) {
        sendJson(res, 500, { status: "error", message: err.message });
      } finally {
        await db.close();
      }
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/{filePath}`,
    auth: "plugin",
    async handler(req, res) {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const subPath = decodeURIComponent(
        parsed.pathname.slice(ROUTE_PREFIX.length + 1),
      );

      if (subPath.startsWith("api/")) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const filePath = nodePath.normalize(nodePath.join(SRC_DIR, subPath));
      if (!filePath.startsWith(SRC_DIR)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      if (!nodeFs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
      serveStaticFile(res, filePath);
    },
  });

  // ---------------------------------------------------------------------------
  // Tool: knowledge_collect
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_collect",
      label: "Knowledge: Collect",
      description:
        "将 URL 或本地文件路径加入知识收集队列（非阻塞）。支持微信公众号、知乎、小红书、即刻、X.com、Reddit、Bilibili、YouTube、GitHub、通用网页及本地 PDF/DOCX/MD/HTML。" +
        "实际抓取与 AI 总结由 cron 批处理（openclaw knowledge process-inbox）异步完成。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要收集的文章 URL（与 path 二选一）",
          },
          path: {
            type: "string",
            description: "本地文件路径（PDF/DOCX/MD/HTML/TXT，与 url 二选一）",
          },
          priority: {
            type: "boolean",
            description: "优先入库（默认 false，true 时 cron 下次批处理优先处理）",
          },
          flomo: {
            type: "boolean",
            description: "入库后是否推送到 Flomo（默认跟随插件 defaultFlomo 配置）",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
          note: {
            type: "string",
            description: "备注（可选）",
          },
          noSummary: {
            type: "boolean",
            description: "仅抓取，跳过 AI 总结（默认 false）",
          },
          force: {
            type: "boolean",
            description: "强制重新抓取，忽略缓存（默认 false）",
          },
          forceSummary: {
            type: "boolean",
            description: "强制重新总结（默认 false）",
          },
          downloadMedia: {
            type: "boolean",
            description: "下载推文/页面中的图片与视频到 scrape 目录（默认 false）",
          },
        },
      },
      async execute(_toolCallId, params) {
        try {
          const { enqueueLink } = await import("../cli/lib/link-queue.js");
          const target = params.path || params.url;
          if (!target) {
            return textResult("请提供 url 或 path 参数。");
          }

          const flomo = params.flomo === undefined ? null : !!params.flomo;
          const result = await enqueueLink(target, {
            workspace: collectorWorkspace,
            dbPath: collectorDbPath,
            priority: !!params.priority,
            tags: Array.isArray(params.tags) ? params.tags : [],
            autoTags: !Array.isArray(params.tags) || params.tags.length === 0,
            note: params.note || "",
            flomo,
            noSummary: !!params.noSummary,
            force: !!params.force,
            forceSummary: !!params.forceSummary,
            downloadMedia: params.downloadMedia ?? false,
          });

          if (result.status === "already_in_db") {
            return textResult(
              `该内容已在知识库中。\n  标题: ${result.title || "(无标题)"}\n  ID: ${result.recordId}\n  来源: ${result.target}`,
            );
          }
          if (result.status === "already_queued") {
            return textResult(`该链接已在队列中，等待 cron 批处理入库。\n  来源: ${result.target}`);
          }

          const priorityHint = result.priority ? "（已标记优先，cron 将优先处理）" : "";
          return textResult(
            `✓ 已加入收集队列${priorityHint}\n  来源: ${result.target}\n  说明: 将由定时批处理异步抓取、总结并入库，不会阻塞当前会话。`,
          );
        } catch (err) {
          return textResult(`入队失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_search
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_search",
      label: "Knowledge: Search",
      description: "在知识库中按关键词搜索文章。返回匹配的文章列表，包含标题、摘要、来源等信息。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" },
          source: {
            type: "string",
            description: "按平台筛选（wechat|zhihu|xiaohongshu|x_com|reddit|bilibili|youtube|github|jike）",
          },
        },
        required: ["keyword"],
      },
      async execute(_toolCallId, params) {
        try {
          const { searchArticles } = await import("../cli/lib/data-reader.js");
          const result = await searchArticles(params.keyword, {
            dbPath: collectorDbPath,
            source: params.source,
          });
          if (!result || result.length === 0) {
            return textResult(`未找到包含 "${params.keyword}" 的文章。`);
          }
          return jsonResult(result);
        } catch (err) {
          return textResult(`搜索失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_list
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_list",
      label: "Knowledge: List",
      description: "列出知识库中的文章。支持按平台筛选、分页和排序。",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "按平台筛选（wechat|zhihu|xiaohongshu|x_com|reddit|bilibili|youtube|github|jike）",
          },
          page: { type: "number", description: "页码（默认 1）" },
          perPage: { type: "number", description: "每页数量（默认 20）" },
          sort: {
            type: "string",
            description: "排序字段，前缀 - 表示降序（默认 -created）",
          },
        },
      },
      async execute(_toolCallId, params) {
        try {
          const { listArticles } = await import("../cli/lib/data-reader.js");
          const result = await listArticles({
            dbPath: collectorDbPath,
            source: params.source,
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
          });
          if (!result || result.length === 0) {
            return textResult("知识库中暂无文章。");
          }
          return jsonResult(result);
        } catch (err) {
          return textResult(`列表查询失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_get
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_get",
      label: "Knowledge: Get Article",
      description: "根据 ID 获取知识库中某篇文章的详细信息，包含完整内容、摘要和推荐理由。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "文章记录 ID" },
        },
        required: ["id"],
      },
      async execute(_toolCallId, params) {
        try {
          const { getArticle } = await import("../cli/lib/data-reader.js");
          const result = await getArticle(params.id, { dbPath: collectorDbPath });
          if (!result) {
            return textResult(`未找到 ID 为 "${params.id}" 的文章。`);
          }
          return jsonResult(result);
        } catch (err) {
          return textResult(`查询失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_stats
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_stats",
      label: "Knowledge: Stats",
      description: "获取知识库的统计信息，包括文章总数、各平台数量分布等。",
      parameters: { type: "object", properties: {} },
      async execute() {
        try {
          const { getStats } = await import("../cli/lib/data-reader.js");
          const stats = await getStats({ dbPath: collectorDbPath });

          const lines = ["## 知识库统计"];
          if (stats.total !== undefined) {
            lines.push(`  文章总数: ${stats.total}`);
          }
          if (stats.sources) {
            lines.push("  平台分布:");
            for (const [source, count] of Object.entries(stats.sources)) {
              lines.push(`    - ${source}: ${count}`);
            }
          }
          if (lines.length === 1) {
            return jsonResult(stats);
          }
          return textResult(lines.join("\n"));
        } catch (err) {
          return textResult(`统计查询失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_delete
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_delete",
      label: "Knowledge: Delete",
      description: "从知识库中删除指定 ID 的文章记录。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "要删除的文章记录 ID" },
        },
        required: ["id"],
      },
      async execute(_toolCallId, params) {
        try {
          const { deleteArticle } = await import("../cli/lib/data-reader.js");
          const result = await deleteArticle(params.id, { dbPath: collectorDbPath });

          if (memorySyncEnabled) runMemorySync();

          return textResult(`✓ 已删除文章 ${params.id}`);
        } catch (err) {
          return textResult(`删除失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // Tool: knowledge_export
  // ---------------------------------------------------------------------------

  api.registerTool(
    {
      name: "knowledge_export",
      label: "Knowledge: Export",
      description:
        "导出知识库文章。支持多种格式：prism（Markdown 日记）、json、md。",
      parameters: {
        type: "object",
        properties: {
          format: {
            type: "string",
            description: "导出格式: prism | json | md（默认 json）",
            enum: ["prism", "json", "md"],
          },
          force: {
            type: "boolean",
            description: "全量导出，忽略增量状态（默认 false）",
          },
        },
      },
      async execute(_toolCallId, params) {
        try {
          const { exportArticles } = await import("../cli/lib/exporter.js");
          const result = await exportArticles({
            format: params.format || "json",
            force: params.force ?? false,
            dbPath: collectorDbPath,
          });
          return jsonResult(result);
        } catch (err) {
          return textResult(`导出失败: ${err.message}`);
        }
      },
    },
    { optional: true },
  );

  // ---------------------------------------------------------------------------
  // CLI: openclaw knowledge {stats|list|search|collect}
  // ---------------------------------------------------------------------------

  api.registerCli(
    ({ program }) => {
      const knowledge = program
        .command("knowledge")
        .description("JS Knowledge Collector — 知识收集器");

      knowledge
        .command("stats")
        .description("查看知识库统计信息")
        .action(async () => {
          try {
            const { getStats } = await import("../cli/lib/data-reader.js");
            const stats = await getStats({ dbPath: collectorDbPath });
            console.log("\n=== 知识库统计 ===");
            if (stats.total !== undefined) {
              console.log(`  文章总数: ${stats.total}`);
            }
            if (stats.sources) {
              console.log("  平台分布:");
              for (const [source, count] of Object.entries(stats.sources)) {
                console.log(`    - ${source}: ${count}`);
              }
            }
            console.log("");
          } catch (err) {
            console.error(`查询失败: ${err.message}`);
          }
        });

      knowledge
        .command("list")
        .description("列出知识库文章")
        .option("--source <platform>", "按平台筛选")
        .option("--page <n>", "页码", "1")
        .option("--per-page <n>", "每页数量", "20")
        .action(async (opts) => {
          try {
            const { listArticles } = await import("../cli/lib/data-reader.js");
            const result = await listArticles({
              dbPath: collectorDbPath,
              source: opts.source,
              page: parseInt(opts.page, 10),
              perPage: parseInt(opts.perPage, 10),
            });
            console.log(JSON.stringify(result, null, 2));
          } catch (err) {
            console.error(`查询失败: ${err.message}`);
          }
        });

      knowledge
        .command("search <keyword>")
        .description("搜索知识库文章")
        .option("--source <platform>", "按平台筛选")
        .action(async (keyword, opts) => {
          try {
            const { searchArticles } = await import("../cli/lib/data-reader.js");
            const result = await searchArticles(keyword, {
              dbPath: collectorDbPath,
              source: opts.source,
            });
            console.log(JSON.stringify(result, null, 2));
          } catch (err) {
            console.error(`搜索失败: ${err.message}`);
          }
        });

      knowledge
        .command("collect <input>")
        .description("立即收集一篇文章或本地文件（抓取 + AI 总结 + 入库，不经过队列）")
        .option("--flomo", "推送到 Flomo（默认跟随 defaultFlomo 配置）")
        .option("--no-flomo", "不推送到 Flomo")
        .option("--no-summary", "跳过 AI 总结")
        .option("--force", "强制重新抓取")
        .option("--download-media", "下载页面媒体到 scrape 目录")
        .action(async (input, opts) => {
          try {
            const { collect } = await import("../cli/lib/collector.js");
            const flomo = opts.noFlomo
              ? false
              : (opts.flomo ? true : defaultFlomo);
            const result = await collect(input, {
              dbPath: collectorDbPath,
              flomo,
              noSummary: !!opts.noSummary,
              force: !!opts.force,
              downloadMedia: !!opts.downloadMedia,
            });
            if (memorySyncEnabled) await runMemorySync();
            console.log(`\n✓ 收集成功: ${result.title || "(无标题)"}`);
            console.log(`  记录 ID: ${result.record_id}`);
            console.log(`  URL: ${result.url}`);
            if (result.flomoError) console.log(`  Flomo: 推送失败 — ${result.flomoError}`);
            else console.log(`  Flomo 推送: ${result.sentToFlomo ? "是" : "否"}`);
            console.log("");
          } catch (err) {
            console.error(`收集失败: ${err.message}`);
            process.exitCode = 1;
          }
        });

      knowledge
        .command("process-inbox")
        .description("处理 link-collector 队列（cron 批处理入口；空队列输出 NO_REPLY）")
        .action(async () => {
          try {
            const { processInbox } = await import("../cli/lib/link-queue.js");
            await processInbox({
              workspace: collectorWorkspace,
              dbPath: collectorDbPath,
              defaultFlomo,
              memorySyncEnabled,
              memorySyncDir,
              onCollected: () => runMemorySync(),
            });
          } catch (err) {
            console.error(`process-inbox 失败: ${err.message}`);
            process.exitCode = 1;
          }
        });
      knowledge
        .command("sync")
        .description("将知识库摘要同步到 Markdown（供 memory_search 检索）")
        .option("--force", "全量重新导出（忽略增量状态）")
        .option("--dir <path>", "自定义导出目录")
        .action(async (opts) => {
          try {
            const { syncToMemory } = await import("../cli/lib/memory-sync.js");
            const outputDir = opts.dir
              ? nodePath.resolve(opts.dir)
              : memorySyncDir;
            const result = await syncToMemory({
              dbPath: collectorDbPath,
              outputDir,
              force: !!opts.force,
            });
            console.log(`\n=== 记忆同步完成 ===`);
            console.log(`  同步: ${result.synced} 篇`);
            console.log(`  清理: ${result.deleted} 篇`);
            console.log(`  总计: ${result.total} 篇`);
            console.log(`  目录: ${outputDir}`);
            console.log(`\n提示: 请确保 openclaw.json 中 agents.defaults.memorySearch.extraPaths 包含上述目录。\n`);
          } catch (err) {
            console.error(`同步失败: ${err.message}`);
          }
        });

      knowledge
        .command("setup-collector")
        .description("配置链接收集器的 cron 定时任务（command 批处理，空队列静默）")
        .option("--every <minutes>", "执行间隔（分钟）", "30")
        .option("--tz <timezone>", "时区（IANA）", "Asia/Shanghai")
        .option("--to <feishuOpenId>", "飞书通知目标 Open ID", "ou_812340c1a43cb8c7b173fb1d569553a2")
        .option("--remove", "移除定时任务")
        .action(async (opts) => {
          const JOB_NAME = "link-collector-process";
          const openclawBin = process.argv[0];
          const openclawEntry = process.argv[1];
          const FEISHU_TO = opts.to;

          function runOcCron(args) {
            return execFileSync(openclawBin, [openclawEntry, "cron", ...args], {
              encoding: "utf-8",
              timeout: 30_000,
            }).trim();
          }

          try {
            const listJson = runOcCron(["list", "--json"]);
            const { jobs } = JSON.parse(listJson);
            const existing = jobs.find((j) => j.name === JOB_NAME);

            if (opts.remove) {
              if (!existing) {
                console.log(`\n  未找到名为 "${JOB_NAME}" 的定时任务，无需移除。\n`);
                return;
              }
              runOcCron(["rm", existing.id]);
              console.log(`\n  ✓ 已移除定时任务 "${JOB_NAME}" (${existing.id})\n`);
              return;
            }

            if (existing) {
              runOcCron(["rm", existing.id]);
              console.log(`  已移除旧任务 "${JOB_NAME}" (${existing.id})，准备重建为 command 任务 ...`);
            }

            const minutes = parseInt(opts.every, 10);
            if (isNaN(minutes) || minutes < 1) {
              console.error("  错误: --every 必须为正整数（分钟）");
              return;
            }

            const cronExpr = `*/${minutes} * * * *`;
            const commandArgv = JSON.stringify([
              openclawBin,
              openclawEntry,
              "knowledge",
              "process-inbox",
            ]);

            const result = runOcCron([
              "add",
              "--name", JOB_NAME,
              "--cron", cronExpr,
              "--tz", opts.tz,
              "--command-argv", commandArgv,
              "--announce",
              "--channel", "feishu",
              "--to", FEISHU_TO,
              "--json",
            ]);

            const job = JSON.parse(result);
            console.log(`\n  ✓ 定时任务已创建（command 批处理）`);
            console.log(`    名称: ${job.name}`);
            console.log(`    ID:   ${job.id}`);
            console.log(`    调度: 每 ${minutes} 分钟`);
            console.log(`    时区: ${opts.tz}`);
            console.log(`    命令: openclaw knowledge process-inbox`);
            console.log(`    通知: 飞书 ${FEISHU_TO}（空队列 NO_REPLY 不推送）\n`);
          } catch (err) {
            console.error(`  配置失败: ${err.message}`);
            if (err.stderr) console.error(err.stderr);
            process.exitCode = 1;
          }
        });
    },
    { commands: ["knowledge"] },
  );
}

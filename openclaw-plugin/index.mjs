import nodePath from "node:path";
import nodeFs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = nodePath.resolve(__dirname, "..");
const SRC_DIR = nodePath.join(PROJECT_ROOT, "src");

const ROUTE_PREFIX = "/plugins/knowledge";

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
  if (pluginCfg.dbPath) process.env.DB_PATH = pluginCfg.dbPath;
  if (pluginCfg.llmApiBaseUrl) process.env.LLM_API_BASE_URL = pluginCfg.llmApiBaseUrl;
  if (pluginCfg.llmApiKey) process.env.LLM_API_KEY = pluginCfg.llmApiKey;
  if (pluginCfg.llmApiModel) process.env.LLM_API_MODEL = pluginCfg.llmApiModel;
  if (pluginCfg.flomoWebhookUrl) process.env.FLOMO_WEBHOOK_URL = pluginCfg.flomoWebhookUrl;
}

function resolveDbPath() {
  return process.env.DB_PATH || nodePath.join(PROJECT_ROOT, "data", "data.db");
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
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });
  res.writeHead(200, { "Content-Type": mime });
  stream.pipe(res);
}

async function getDb() {
  const Database = (await import("../cli/lib/database.js")).default;
  const db = new Database(resolveDbPath());
  await db.connect();
  return db;
}

export default function register(api) {
  // Load project-local .env first (override: false → won't clobber existing env vars)
  dotenv.config({ path: nodePath.join(PROJECT_ROOT, ".env"), override: false });

  const pluginCfg = api.pluginConfig ?? {};

  const serverPort = pluginCfg.serverPort || 3000;
  const autoStart = pluginCfg.autoStartServer ?? false;

  // openclaw.json pluginConfig values take precedence over .env
  applyEnv(pluginCfg);

  let serverInstance = null;

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
    async handler(req, res) {
      res.writeHead(301, { Location: `${ROUTE_PREFIX}/` });
      res.end();
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/`,
    async handler(req, res) {
      serveStaticFile(res, nodePath.join(SRC_DIR, "index.html"));
    },
  });

  api.registerHttpRoute({
    path: `${ROUTE_PREFIX}/api/v1/articles.json`,
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
      const db = await getDb();
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
    async handler(req, res) {
      const db = await getDb();
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
    path: `${ROUTE_PREFIX}/api/v1/articles/{id}`,
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
      const db = await getDb();
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
        "从 URL 收集知识文章。完整流程：抓取网页内容 → AI 总结（概要/摘要/推荐理由）→ 保存到知识库。" +
        "支持微信公众号、知乎、小红书、即刻、X.com、Reddit、Bilibili、YouTube、GitHub 及通用网页。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要收集的文章 URL" },
          flomo: {
            type: "boolean",
            description: "是否同时发送摘要到 Flomo（默认 false）",
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
        },
        required: ["url"],
      },
      async execute(_toolCallId, params) {
        try {
          const { collect } = await import("../cli/lib/collector.js");
          const result = await collect(params.url, {
            flomo: params.flomo ?? false,
            noSummary: params.noSummary ?? false,
            force: params.force ?? false,
            forceSummary: params.forceSummary ?? false,
          });

          const lines = [
            `✓ 收集成功`,
            `  标题: ${result.title || "(无标题)"}`,
            `  URL: ${result.url}`,
            `  记录 ID: ${result.record_id}`,
            `  AI 总结: ${result.hasSummary ? "是" : "否"}`,
            `  Flomo 推送: ${result.sentToFlomo ? "是" : "否"}`,
          ];
          return textResult(lines.join("\n"));
        } catch (err) {
          return textResult(`收集失败: ${err.message}`);
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
          const result = await getArticle(params.id);
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
          const stats = await getStats();

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
          const result = await deleteArticle(params.id);
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
            const stats = await getStats();
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
              source: opts.source,
            });
            console.log(JSON.stringify(result, null, 2));
          } catch (err) {
            console.error(`搜索失败: ${err.message}`);
          }
        });

      knowledge
        .command("collect <url>")
        .description("收集一篇文章（抓取 + AI 总结 + 入库）")
        .option("--flomo", "同时推送到 Flomo")
        .option("--no-summary", "跳过 AI 总结")
        .option("--force", "强制重新抓取")
        .action(async (url, opts) => {
          try {
            const { collect } = await import("../cli/lib/collector.js");
            const result = await collect(url, {
              flomo: !!opts.flomo,
              noSummary: !!opts.noSummary,
              force: !!opts.force,
            });
            console.log(`\n✓ 收集成功: ${result.title || "(无标题)"}`);
            console.log(`  记录 ID: ${result.record_id}`);
            console.log(`  URL: ${result.url}\n`);
          } catch (err) {
            console.error(`收集失败: ${err.message}`);
          }
        });
    },
    { commands: ["knowledge"] },
  );
}

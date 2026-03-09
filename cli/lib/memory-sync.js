/**
 * MemorySync — 将知识库摘要导出为 Markdown，桥接 OpenClaw memory_search
 *
 * 增量同步：对比 .sync-state.json 中已同步的 ID/updated 时间戳，
 * 只写入新增或更新的文章，并清理已删除文章的 .md 文件。
 */

import fs from "node:fs";
import path from "node:path";
import Database from "./database.js";

const SYNC_STATE_FILE = ".sync-state.json";

function articleToMarkdown(article) {
  const title = article.title || "(无标题)";
  const sections = [`# ${title}`, ""];

  if (article.source_url) {
    sections.push(`> 来源: [${article.source_url}](${article.source_url})`);
  }
  if (article.created) {
    sections.push(`> 收集时间: ${article.created}`);
  }
  sections.push(`> ID: ${article.id}`);

  if (article.recommend) {
    sections.push("", "## 推荐理由", "", article.recommend);
  }
  if (article.summary) {
    sections.push("", "## 摘要", "", article.summary);
  }
  if (article.digest) {
    sections.push("", "## 详细摘要", "", article.digest);
  }

  return sections.join("\n") + "\n";
}

function loadSyncState(outputDir) {
  const filePath = path.join(outputDir, SYNC_STATE_FILE);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return { lastSyncAt: null, articles: {} };
}

function saveSyncState(outputDir, state) {
  const filePath = path.join(outputDir, SYNC_STATE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

function mdFileName(id) {
  return `article-${id}.md`;
}

/**
 * 将知识库摘要增量同步为 Markdown 文件。
 *
 * @param {Object} opts
 * @param {string} opts.dbPath     SQLite 数据库路径
 * @param {string} opts.outputDir  Markdown 输出目录
 * @param {boolean} [opts.force]   强制全量重新导出
 * @returns {Promise<{synced: number, deleted: number, total: number}>}
 */
export async function syncToMemory({ dbPath, outputDir, force = false }) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const db = new Database(dbPath);
  await db.connect();

  try {
    const articles = await db.all(
      `SELECT id, title, summary, digest, recommend, source_url, created, updated
       FROM jszhang_collected_articles
       ORDER BY created ASC`,
    );

    const state = force ? { lastSyncAt: null, articles: {} } : loadSyncState(outputDir);
    const dbIdSet = new Set(articles.map((a) => a.id));

    let synced = 0;
    for (const article of articles) {
      const prev = state.articles[article.id];
      const needsWrite = !prev || prev.updated !== article.updated;
      if (!needsWrite) continue;

      const md = articleToMarkdown(article);
      fs.writeFileSync(path.join(outputDir, mdFileName(article.id)), md, "utf-8");

      state.articles[article.id] = { updated: article.updated };
      synced++;
    }

    let deleted = 0;
    for (const id of Object.keys(state.articles)) {
      if (!dbIdSet.has(id)) {
        const filePath = path.join(outputDir, mdFileName(id));
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
        delete state.articles[id];
        deleted++;
      }
    }

    state.lastSyncAt = new Date().toISOString();
    saveSyncState(outputDir, state);

    return { synced, deleted, total: articles.length };
  } finally {
    await db.close();
  }
}

/**
 * Exporter — 文章导出模块
 *
 * 支持 prism（Markdown journal）/ json / md 格式导出。
 * 基于 agent-js/scripts/exportJsKnowledgeToPrism.js 改造。
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const EXPORTED_IDS_FILE = 'exported_ids.json';

function resolveDbPath() {
    return process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'data.db');
}

// ── 工具函数 ─────────────────────────────────────────────────────────

function idToSlug(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    return id.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 100);
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const m = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

function htmlToText(html) {
    if (!html || typeof html !== 'string') return '';
    if (!html.trim().includes('<')) return html;
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function articleToMarkdown(article) {
    const title = article.title || '(无标题)';
    const sourceUrl = article.source_url || '';
    const sections = [`# ${title}`, ''];

    if (sourceUrl) {
        sections.push(`> 来源：[${sourceUrl}](${sourceUrl})`);
        sections.push(`> ID: ${article.id}`);
    }

    if (article.recommend) { sections.push('', '## 推荐理由', '', article.recommend); }
    if (article.summary)   { sections.push('', '## 摘要', '', article.summary); }
    if (article.digest)    { sections.push('', '## 详细摘要', '', article.digest); }

    const content = htmlToText(article.content || '');
    if (content) { sections.push('', '## 正文', '', content); }

    return sections.join('\n');
}

// ── 增量追踪 ─────────────────────────────────────────────────────────

function loadExportedIds(exportDir) {
    const filePath = path.join(exportDir, EXPORTED_IDS_FILE);
    if (!fs.existsSync(filePath)) return { ids: [], lastExportAt: null };
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { ids: data.jsKnowledgeIds || [], lastExportAt: data.lastExportAt || null };
    } catch {
        return { ids: [], lastExportAt: null };
    }
}

function saveExportedIds(exportDir, ids) {
    const filePath = path.join(exportDir, EXPORTED_IDS_FILE);
    fs.writeFileSync(filePath, JSON.stringify({ jsKnowledgeIds: ids, lastExportAt: new Date().toISOString() }, null, 2), 'utf-8');
}

function ensureUniquePath(dir, dateDir, slug) {
    const dirPath = path.join(dir, dateDir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    let s = slug, i = 0;
    while (true) {
        const fp = path.join(dirPath, `${s}.md`);
        if (!fs.existsSync(fp)) return fp;
        i++;
        s = `${slug}-${i}`;
    }
}

// ── 查询全部文章 ────────────────────────────────────────────────────

async function getAllArticles() {
    const db = new Database(resolveDbPath());
    await db.connect();
    try {
        return await db.all(
            'SELECT id, title, summary, digest, content, source_url, created, updated, recommend FROM jszhang_collected_articles ORDER BY created ASC',
        );
    } finally {
        await db.close();
    }
}

// ── 导出函数 ─────────────────────────────────────────────────────────

/**
 * 导出文章
 * @param {Object} options
 * @param {string} [options.format='json']  prism | json | md
 * @param {boolean} [options.force=false]   全量重导
 * @param {string} [options.outputDir]      输出目录
 * @returns {Promise<Object>} 导出结果
 */
export async function exportArticles(options = {}) {
    const { format = 'json', force = false } = options;
    const articles = await getAllArticles();

    if (!articles.length) return { exported: 0, total: 0, format };

    // ── JSON 导出 ────
    if (format === 'json') {
        const outDir = options.outputDir || path.join(PROJECT_ROOT, 'work_dir', 'export');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, `articles_${new Date().toISOString().slice(0, 10)}.json`);
        fs.writeFileSync(outFile, JSON.stringify(articles, null, 2), 'utf-8');
        return { exported: articles.length, total: articles.length, format, outputPath: outFile };
    }

    // ── Markdown 导出（单文件） ────
    if (format === 'md') {
        const outDir = options.outputDir || path.join(PROJECT_ROOT, 'work_dir', 'export');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, `articles_${new Date().toISOString().slice(0, 10)}.md`);
        const content = articles.map(a => articleToMarkdown(a)).join('\n\n---\n\n');
        fs.writeFileSync(outFile, content, 'utf-8');
        return { exported: articles.length, total: articles.length, format, outputPath: outFile };
    }

    // ── Prism 增量导出（逐篇 Markdown） ────
    if (format === 'prism') {
        const prismDir = options.outputDir || path.join(PROJECT_ROOT, 'work_dir', 'knowledge-prism');
        const journalDir = path.join(prismDir, 'journal');

        let { ids: exportedIds } = force ? { ids: [] } : loadExportedIds(prismDir);
        const exportedSet = new Set(exportedIds);
        const toExport = articles.filter(a => !exportedSet.has(a.id));

        if (!toExport.length) return { exported: 0, total: articles.length, format, reason: 'up_to_date' };

        const newIds = [];
        for (const article of toExport) {
            const dateStr = parseDate(article.created) || parseDate(article.updated) || new Date().toISOString().slice(0, 10);
            const slug = idToSlug(article.id);
            const filePath = ensureUniquePath(journalDir, dateStr, slug);
            fs.writeFileSync(filePath, articleToMarkdown(article), 'utf-8');
            newIds.push(article.id);
        }

        saveExportedIds(prismDir, [...exportedIds, ...newIds]);
        return { exported: newIds.length, total: articles.length, format, journalDir };
    }

    throw new Error(`不支持的导出格式: ${format}`);
}

/**
 * Collector — 知识收集流水线
 *
 * 提取自 agent-js/scripts/scrapeAndSummarize.js。
 * 串联 scraper → summarizer → database → flomo 的完整收集流程。
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scrape, detectRuleName } from './scraper.js';
import { summarize } from './summarizer.js';
import Database from './database.js';
import { sendToFlomo, sendFileToFlomo } from './flomo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const log = (msg) => process.stderr.write(msg + '\n');

function resolveDbPath() {
    return process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'data.db');
}

// ── URL 预处理 ──────────────────────────────────────────────────────

function convertUrl(url) {
    if (url.includes('b23.tv') || url.includes('bilibili.com')) return { url, type: 'bilibili' };
    if (url.includes('youtube.com') || url.includes('youtu.be')) return { url, type: 'youtube' };
    return { url, type: 'general' };
}

function shouldUseBrowser(url) {
    const ruleName = detectRuleName(url);
    const httpOnlyRules = ['github', 'bilibili', 'youtube'];
    return !httpOnlyRules.includes(ruleName);
}

// ── 数据组装 ─────────────────────────────────────────────────────────

function assembleData(scrapeResult, summaryResult, url) {
    const data = scrapeResult?.data || {};
    const title = data.title || '';
    const content = data.content || data.description || '';
    const coverUrl = data.cover_url || data.image_urls?.[0] || '';
    const sourceUrl = data.source_url || url;

    return {
        title,
        summary: summaryResult?.summary || '',
        digest: summaryResult?.digest || '',
        content,
        cover_url: coverUrl,
        source_url: sourceUrl,
        recommend: summaryResult?.recommendation || '',
    };
}

// ── 缓存检查 ─────────────────────────────────────────────────────────

async function findCachedScrape(url) {
    const { generateFileName } = await import('./scraper.js');
    const { getCategoryDir } = await import('./scraper.js');
    const ruleName = detectRuleName(url);
    const categoryDir = getCategoryDir(ruleName);
    const fileName = generateFileName(url);
    const baseName = path.basename(fileName, '.json');
    const cachedPath = path.join(PROJECT_ROOT, 'work_dir', 'scrape', categoryDir, baseName, 'data.json');
    if (existsSync(cachedPath)) return cachedPath;
    return null;
}

// ── 核心导出 ─────────────────────────────────────────────────────────

/**
 * 完整收集流程：抓取 → 总结 → 入库 → Flomo
 *
 * @param {string} url 目标 URL
 * @param {Object} [options]
 * @param {boolean} [options.flomo=false]        发送到 Flomo
 * @param {boolean} [options.noSummary=false]     跳过 AI 总结
 * @param {boolean} [options.force=false]         强制重新抓取
 * @param {boolean} [options.forceSummary=false]  强制重新总结
 * @returns {Promise<Object>} 收集结果
 */
export async function collect(url, options = {}) {
    const { flomo = false, noSummary = false, force = false, forceSummary = false } = options;

    const { url: finalUrl, type: urlType } = convertUrl(url);
    log(`收集: ${finalUrl} (类型: ${urlType})`);

    // 1. 抓取
    let scrapeOutputPath;
    if (!force) {
        scrapeOutputPath = await findCachedScrape(finalUrl);
        if (scrapeOutputPath) log(`使用缓存抓取结果: ${scrapeOutputPath}`);
    }

    let scrapeResult;
    if (!scrapeOutputPath) {
        log('Step 1: 抓取网页内容 ...');
        const useBrowser = shouldUseBrowser(finalUrl);
        const { outputPath, result } = await scrape(finalUrl, {
            useBrowser,
            useBrowserCookies: useBrowser,
        });
        scrapeOutputPath = outputPath;
        scrapeResult = result;
    } else {
        const raw = await fs.readFile(scrapeOutputPath, 'utf-8');
        scrapeResult = JSON.parse(raw);
    }

    // 2. AI 总结
    let summaryResult = null;
    if (!noSummary) {
        log('Step 2: AI 总结 ...');
        try {
            summaryResult = await summarize(scrapeOutputPath, {});
        } catch (err) {
            log(`AI 总结失败: ${err.message}，继续流程`);
        }
    }

    // 3. 组装数据
    const assembled = assembleData(scrapeResult, summaryResult, finalUrl);
    log(`Step 3: 数据组装完成 — ${assembled.title || '(无标题)'}`);

    // 4. 入库
    log('Step 4: 保存到数据库 ...');
    const db = new Database(resolveDbPath());
    await db.connect();
    try {
        const { record_id } = await db.addRecord(assembled);
        log(`已保存: ${record_id}`);
        assembled.record_id = record_id;
    } finally {
        await db.close();
    }

    // 5. Flomo
    if (flomo && summaryResult?.summaryDir) {
        log('Step 5: 发送摘要到 Flomo ...');
        try {
            const digestPath = path.join(summaryResult.summaryDir, 'digest.txt');
            if (existsSync(digestPath)) {
                await sendFileToFlomo(digestPath);
                log('Flomo 发送成功');
            }
        } catch (err) {
            log(`Flomo 发送失败: ${err.message}`);
        }
    }

    return {
        status: 'success',
        url: finalUrl,
        title: assembled.title,
        record_id: assembled.record_id,
        scrapeOutputPath,
        summaryDir: summaryResult?.summaryDir || null,
        hasSummary: !!summaryResult,
        sentToFlomo: flomo && !!summaryResult,
    };
}

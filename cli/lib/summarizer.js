/**
 * Summarizer — 渐进式 AI 总结
 *
 * 提取自 agent-js/scripts/progressiveSummary.js，精简为可导入的函数模块。
 * 三阶段流水线：概要 → 摘要 → 推荐
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chat } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = path.resolve(__dirname, '..', '..', 'prompts');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const log = (msg) => process.stderr.write(msg + '\n');

// ── 提示词加载 ──────────────────────────────────────────────────────

async function loadPrompts() {
    const files = {
        summary: path.join(PROMPT_DIR, 'summary.txt'),
        digest: path.join(PROMPT_DIR, 'digest.txt'),
        recommendation: path.join(PROMPT_DIR, 'recommendation.txt'),
    };
    const prompts = {};
    for (const [key, filePath] of Object.entries(files)) {
        prompts[key] = await fs.readFile(filePath, 'utf-8');
    }
    return prompts;
}

// ── 输入解析 ─────────────────────────────────────────────────────────

function extractSubtitleText(subtitles) {
    if (!subtitles) return '';
    const priorities = ['zh-Hans', 'zh-Hant', 'zh', 'en'];
    for (const lang of priorities) {
        if (subtitles[lang]) return subtitles[lang];
    }
    const first = Object.values(subtitles)[0];
    return typeof first === 'string' ? first : '';
}

async function readScrapeResult(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');

    try {
        const json = JSON.parse(raw);
        const data = json.data || json;
        let content = '';
        let title = data.title || '';
        const sourceUrl = data.source_url || '';

        if (data.subtitles) {
            content = extractSubtitleText(data.subtitles);
        } else if (data.content) {
            content = data.content;
        } else if (data.summary) {
            content = data.summary;
        } else if (data.description) {
            content = data.description;
        }

        return { content, title, sourceUrl, isJson: true };
    } catch {
        return { content: raw, title: '', sourceUrl: '', isJson: false };
    }
}

function cleanContent(raw) {
    return raw
        .replace(/!\[Image\]\([^)]*\)/g, '')
        .replace(/\[[\s]*!\[Image\]\([^)]*\)\s*\]\([^)]*\)/g, '')
        .replace(/^[\s]*(点击下方卡片，关注公众号|封面图片来自网络|文章为作者独立观点.*?立场。?)[\s]*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function formatInput(content, title, sourceUrl) {
    let text = '';
    if (title) text += `标题: ${title}\n\n`;
    text += cleanContent(content);
    if (sourceUrl) text += `\n\n原文链接: ${sourceUrl}`;
    return text;
}

// ── 单 Agent 处理 ───────────────────────────────────────────────────

async function processWithAgent(prompt, userContent, agentName) {
    log(`[${agentName}] 正在处理 ...`);
    const result = await chat(prompt, userContent);
    log(`[${agentName}] 完成，输出 ${result.length} 字符`);
    return result;
}

// ── 核心导出 ─────────────────────────────────────────────────────────

/**
 * 对抓取结果文件执行渐进式总结
 *
 * @param {string} scrapeOutputPath  抓取结果 JSON 路径
 * @param {Object} [options]
 * @param {string} [options.outputDir]  输出目录（默认 work_dir/summary/<timestamp>_<name>）
 * @returns {Promise<{summaryDir: string, summary: string, digest: string, recommendation: string}>}
 */
export async function summarize(scrapeOutputPath, options = {}) {
    const prompts = await loadPrompts();
    const { content, title, sourceUrl } = await readScrapeResult(scrapeOutputPath);

    if (!content || content.length < 20) {
        throw new Error('输入内容过短，无法生成总结');
    }

    const userContent = formatInput(content, title, sourceUrl);

    const summary = await processWithAgent(prompts.summary, userContent, '概要');
    const digest = await processWithAgent(prompts.digest, userContent, '摘要');
    const recommendation = await processWithAgent(prompts.recommendation, userContent, '推荐');

    const baseName = path.basename(scrapeOutputPath, path.extname(scrapeOutputPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = options.outputDir || path.join(PROJECT_ROOT, 'work_dir', 'summary', `${timestamp}_${baseName}`);

    if (!existsSync(outDir)) await fs.mkdir(outDir, { recursive: true });

    await Promise.all([
        fs.writeFile(path.join(outDir, 'summary.txt'), summary, 'utf-8'),
        fs.writeFile(path.join(outDir, 'digest.txt'), digest, 'utf-8'),
        fs.writeFile(path.join(outDir, 'recommendation.txt'), recommendation, 'utf-8'),
    ]);

    log(`总结结果已保存至: ${outDir}`);
    return { summaryDir: outDir, summary, digest, recommendation };
}

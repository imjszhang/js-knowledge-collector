/**
 * Scraper — 网页内容抓取模块
 *
 * 提取自 agent-js/scripts/scrape.js，转为可导入的函数模块。
 * 支持 HTTP 直接抓取和浏览器自动化两种模式。
 */

import WebScraper from './web-scraper.js';
import BrowserAutomation from './browser-automation.js';
import { createExtension } from './browser-extensions/index.js';
import fs from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ── URL 检测 ─────────────────────────────────────────────────────────

const RULES = [
    { pattern: /^https:\/\/www\.xiaohongshu\.com\/explore\/\w+/, name: 'xiaohongshu' },
    { pattern: /^https?:\/\/mp\.weixin\.qq\.com\/s(\?[\w=&%]+|\/[-\w]+)/, name: 'wechat' },
    { pattern: /^https?:\/\/mp\.weixin\.qq\.com\/mp\/appmsg\/show(\?[\w=&%#]+)?/, name: 'wechat_old' },
    { pattern: /^https:\/\/www\.zhihu\.com\/question\/\d+\/answer\/\d+/, name: 'zhihu_answer' },
    { pattern: /^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+/, name: 'zhihu_zhuanlan' },
    { pattern: /^https:\/\/web\.okjike\.com\/u\/[\w-]+\/post\/[\w]+/, name: 'jike' },
    { pattern: /^https:\/\/web\.okjike\.com\/originalPost\/[\w]+/, name: 'jike_original' },
    { pattern: /^https:\/\/m\.okjike\.com\/originalPosts\/[\w]+/, name: 'jike_mobile' },
    { pattern: /^https:\/\/(x\.com|twitter\.com)\/\w+\/(status|article)\/\d+/, name: 'x_com' },
    { pattern: /^https:\/\/www\.reddit\.com\/r\/[\w]+\/comments\/[\w]+\//, name: 'reddit' },
    { pattern: /bilibili\.com\/video\/|b23\.tv\//, name: 'bilibili' },
    { pattern: /youtube\.com\/(watch|shorts|embed)|youtu\.be\//, name: 'youtube' },
    { pattern: /^https:\/\/github\.com\/[\w-]+\/[\w.-]+/, name: 'github' },
];

const CATEGORY_MAP = {
    wechat: 'wechat', wechat_old: 'wechat',
    xiaohongshu: 'xiaohongshu',
    zhihu_answer: 'zhihu', zhihu_zhuanlan: 'zhihu',
    jike: 'jike', jike_original: 'jike', jike_mobile: 'jike',
    x_com: 'x_com', reddit: 'reddit', github: 'github',
    bilibili: 'bilibili', youtube: 'youtube',
    general: 'web',
};

export function detectRuleName(url) {
    for (const r of RULES) if (r.pattern.test(url)) return r.name;
    return 'general';
}

export function getCategoryDir(ruleName) {
    return CATEGORY_MAP[ruleName] || 'web';
}

// ── 文件名生成 ──────────────────────────────────────────────────────

export function generateFileName(url) {
    try {
        const urlObj = new URL(url);
        const ruleName = detectRuleName(url);

        const extract = (re) => { const m = urlObj.pathname.match(re); return m; };

        switch (ruleName) {
            case 'wechat': case 'wechat_old': {
                const m = extract(/\/s\/([^/?]+)/);
                if (m) return `${m[1]}.json`;
                const id = urlObj.searchParams.get('id') || urlObj.searchParams.get('__biz');
                if (id) return `${id}.json`;
                break;
            }
            case 'xiaohongshu': { const m = extract(/\/explore\/([^/?]+)/); if (m) return `${m[1]}.json`; break; }
            case 'zhihu_answer': { const m = extract(/\/question\/(\d+)\/answer\/(\d+)/); if (m) return `question_${m[1]}_answer_${m[2]}.json`; break; }
            case 'zhihu_zhuanlan': { const m = extract(/\/p\/(\d+)/); if (m) return `zhuanlan_${m[1]}.json`; break; }
            case 'jike': { const m = extract(/\/post\/([\w]+)/); if (m) return `${m[1]}.json`; break; }
            case 'jike_original': { const m = extract(/\/originalPost\/([\w]+)/); if (m) return `original_${m[1]}.json`; break; }
            case 'jike_mobile': { const m = extract(/\/originalPosts\/([\w]+)/); if (m) return `mobile_${m[1]}.json`; break; }
            case 'x_com': { const m = extract(/\/(\w+)\/(status|article)\/(\d+)/); if (m) return `${m[1]}_${m[2]}_${m[3]}.json`; break; }
            case 'reddit': { const m = extract(/\/r\/([\w]+)\/comments\/([\w]+)/); if (m) return `r_${m[1]}_${m[2]}.json`; break; }
            case 'github': { const p = urlObj.pathname.split('/').filter(Boolean); if (p.length >= 2) return `${p[0]}_${p[1]}.json`; break; }
        }

        const hostname = urlObj.hostname.replace(/\./g, '_');
        let pathname = urlObj.pathname.replace(/\//g, '_').replace(/^_/, '') || 'index';
        if (pathname.length > 50) pathname = pathname.substring(0, 50) + '_' + crypto.createHash('md5').update(urlObj.pathname).digest('hex').substring(0, 8);
        const queryPart = urlObj.search ? '_' + crypto.createHash('md5').update(urlObj.search).digest('hex').substring(0, 8) : '';
        return `${hostname}_${pathname}${queryPart}.json`;
    } catch {
        return `scrape_${crypto.createHash('md5').update(url).digest('hex').substring(0, 16)}.json`;
    }
}

// ── Cookies 处理 ────────────────────────────────────────────────────

function convertCookiesToHeader(cookies) {
    if (!Array.isArray(cookies) || !cookies.length) return '';
    const now = Date.now();
    return cookies
        .filter(c => { if (c.expires && c.expires !== -1) { const t = typeof c.expires === 'number' ? c.expires * 1000 : new Date(c.expires).getTime(); return t > now; } return true; })
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
}

async function getCookiesFromBrowser(url, browser) {
    const domain = new URL(url).hostname;
    const result = await browser.getCookiesByDomain(domain, { includeSubdomains: true });
    if (result.status === 'success' && result.cookies?.length) return result.cookies;
    return [];
}

// ── File download helper ────────────────────────────────────────────

function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https:') ? https : http;
        const stream = createWriteStream(filePath);
        protocol.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                stream.close();
                fs.unlink(filePath).catch(() => {});
                return downloadFile(res.headers.location, filePath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) { stream.close(); fs.unlink(filePath).catch(() => {}); return reject(new Error(`HTTP ${res.statusCode}`)); }
            res.pipe(stream);
            stream.on('finish', () => { stream.close(); resolve(filePath); });
            stream.on('error', (e) => { stream.close(); fs.unlink(filePath).catch(() => {}); reject(e); });
        }).on('error', (e) => { stream.close(); fs.unlink(filePath).catch(() => {}); reject(e); });
    });
}

// ── 视频平台抓取（yt-dlp） ───────────────────────────────────────────

/**
 * 通过 yt-dlp 抓取视频平台内容（Bilibili / YouTube）
 *
 * @param {string} url 视频 URL
 * @param {string} ruleName 'bilibili' | 'youtube'
 * @returns {Promise<{outputPath: string, result: Object, category: string}>}
 */
async function scrapeVideo(url, ruleName) {
    const log = (msg) => process.stderr.write(msg + '\n');
    const categoryDir = getCategoryDir(ruleName);

    const platform = ruleName === 'bilibili'
        ? await import('./scraper-bilibili.js')
        : await import('./scraper-youtube.js');

    const videoId = platform.extractVideoId(url);
    if (!videoId) throw new Error(`无法从 URL 中提取视频 ID: ${url}`);

    const postDir = path.join(PROJECT_ROOT, 'work_dir', 'scrape', categoryDir, videoId);
    const outputPath = path.join(postDir, 'data.json');
    if (!existsSync(postDir)) await fs.mkdir(postDir, { recursive: true });

    log(`[${ruleName}] 视频 ID: ${videoId}`);
    log(`[${ruleName}] 获取视频信息 ...`);

    const videoInfo = await platform.getVideoInfo(url, {
        cookiesFromBrowser: 'firefox',
    });

    const extractedData = {
        title: videoInfo.title || '',
        description: videoInfo.description || '',
        content: videoInfo.description || '',
        cover_url: videoInfo.thumbnail || '',
        source_url: videoInfo.webpage_url || videoInfo.original_url || url,
        channel: videoInfo.channel || videoInfo.uploader || '',
        channel_id: videoInfo.channel_id || videoInfo.uploader_id || '',
        duration: videoInfo.duration,
        duration_string: videoInfo.duration_string || '',
        view_count: videoInfo.view_count,
        like_count: videoInfo.like_count,
        comment_count: videoInfo.comment_count,
        tags: videoInfo.tags || [],
    };

    log(`[${ruleName}] 获取字幕 ...`);
    try {
        const defaultSubLangs = ruleName === 'bilibili'
            ? 'zh-Hans,zh-Hant,ai-zh'
            : 'zh-Hans,zh-Hant,en';
        const subtitles = await platform.getSubtitles(url, videoId, {
            subLangs: defaultSubLangs,
            cookiesFromBrowser: 'firefox',
        });
        if (subtitles && Object.keys(subtitles).length > 0) {
            extractedData.subtitles = subtitles;
            log(`[${ruleName}] 获取到 ${Object.keys(subtitles).length} 种语言的字幕: ${Object.keys(subtitles).join(', ')}`);
        } else {
            log(`[${ruleName}] 未找到字幕`);
        }
    } catch (err) {
        log(`[${ruleName}] 获取字幕失败: ${err.message}，继续流程`);
    }

    const result = { error: '0', data: extractedData };
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    log(`抓取结果已保存: ${outputPath}`);

    return { outputPath, result, category: categoryDir };
}

// ── 核心抓取函数 ────────────────────────────────────────────────────

/**
 * 抓取 URL 内容并保存到 work_dir/scrape/<category>/<id>/data.json
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {boolean} [options.useBrowser=false]  使用浏览器自动化
 * @param {boolean} [options.useBrowserCookies=false]
 * @param {string}  [options.browserServer]
 * @param {number}  [options.maxCommentPages=0]
 * @param {boolean} [options.downloadVideos=false]
 * @returns {Promise<{outputPath: string, result: Object, category: string}>}
 */
export async function scrape(url, options = {}) {
    const ruleName = detectRuleName(url);

    if (ruleName === 'bilibili' || ruleName === 'youtube') {
        return await scrapeVideo(url, ruleName);
    }

    const {
        useBrowser = false,
        useBrowserCookies = false,
        browserServer = null,
        maxCommentPages = 0,
        downloadVideos = false,
    } = options;

    const categoryDir = getCategoryDir(ruleName);
    const fileName = generateFileName(url);
    const baseName = path.basename(fileName, '.json');
    const postDir = path.join(PROJECT_ROOT, 'work_dir', 'scrape', categoryDir, baseName);
    const outputPath = path.join(postDir, 'data.json');

    if (!existsSync(postDir)) await fs.mkdir(postDir, { recursive: true });

    const log = (msg) => process.stderr.write(msg + '\n');

    const needsBrowser = useBrowser || useBrowserCookies;
    const browser = needsBrowser ? new BrowserAutomation(browserServer) : null;

    let customUrlRules = null;
    let result;
    try {
        if (useBrowserCookies) {
            log('获取浏览器 cookies ...');
            const cookies = await getCookiesFromBrowser(url, browser);
            if (cookies.length) {
                const header = convertCookiesToHeader(cookies);
                if (header) customUrlRules = JSON.stringify([{ name: ruleName, headers: { Cookie: header } }]);
                log(`已加载 ${cookies.length} 个 cookies`);
            }
        }

        if (useBrowser) {
            log('使用浏览器自动化抓取 ...');
            const extension = createExtension(ruleName, browser);
            const contentWaitConfig = extension?.getContentWaitConfig(url) || { selector: 'body', minContentLength: 100, timeout: 15000 };

            const scrapeResult = await browser.scrapePage(url, {
                reuseTab: true, closeAfter: false, loadTimeout: 30000,
                contentWait: contentWaitConfig,
                beforeGetHtml: extension ? (tabId, u) => extension.prepare(tabId, u) : null,
            });

            const { tabId, html: htmlContent } = scrapeResult;
            let extraData = {};
            if (extension) try { extraData = await extension.extractExtra(tabId, htmlContent, url) || {}; } catch {}
            try { await browser.closeTab(tabId); } catch {}

            const scraper = new WebScraper(url, customUrlRules, { maxCommentPages });
            result = await scraper.scrapeFromHtml(htmlContent);

            if (extraData && result.data) {
                for (const key of ['video_urls', 'image_urls']) {
                    if (extraData[key]?.length) {
                        if (!result.data[key]?.length) result.data[key] = extraData[key];
                        else { const s = new Set(result.data[key]); extraData[key].forEach(u => { if (!s.has(u)) result.data[key].push(u); }); }
                    }
                }
                for (const key in extraData) { if (key !== 'video_urls' && key !== 'image_urls' && !result.data[key]) result.data[key] = extraData[key]; }
            }
        } else {
            const scraper = new WebScraper(url, customUrlRules, { maxCommentPages });
            result = await scraper.scrape();
        }
    } finally {
        if (browser) browser.disconnect();
    }

    if (result.error !== '0') throw new Error(result.detail || 'scrape failed');

    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    log(`抓取结果已保存: ${outputPath}`);

    if (downloadVideos && result.data?.video_urls?.length) {
        for (let i = 0; i < result.data.video_urls.length; i++) {
            const ext = result.data.video_urls[i].includes('.webm') ? '.webm' : '.mp4';
            const vf = path.join(postDir, `video${result.data.video_urls.length > 1 ? '_' + (i + 1) : ''}${ext}`);
            try { await downloadFile(result.data.video_urls[i], vf); log(`视频已下载: ${vf}`); } catch (e) { log(`视频下载失败: ${e.message}`); }
        }
    }

    return { outputPath, result, category: categoryDir };
}

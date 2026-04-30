/**
 * HTML 文件解析器
 *
 * 解析本地 .html / .htm 文件，提取正文文本，输出与现有 scrape 一致的格式。
 *
 * 使用方法：
 *   import { parseHtml } from './parsers/html-parser.js';
 *   const result = await parseHtml('/path/to/file.html');
 *
 * 返回格式：
 *   {
 *     error: "0",
 *     data: {
 *       title: "提取的标题",
 *       content: "HTML正文文本",
 *       source_url: "file://...",
 *       cover_url: "",
 *       description: ""
 *     }
 *   }
 */

import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFileHash } from '../file-path.js';

function normalizeDirname(dirname) {
    if (process.platform === 'win32' && dirname.startsWith('/') && dirname[2] === ':') {
        return dirname.slice(1);
    }
    return dirname;
}

const __dirname = normalizeDirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 从 cheerio 对象中递归提取文本（保留段落换行）
 * 排除 script、style、nav、footer 等非正文元素
 *
 * @param {import('cheerio').CheerioAPI} $ cheerio 实例
 * @param {import('cheerio').Element} 元素
 * @returns {string} 提取的文本
 */
function extractTextRecursive($, elem) {
  let text = '';

  if (elem.type === 'text') {
    text += elem.data || '';
  } else if (elem.type === 'tag') {
    const tagName = elem.tagName.toLowerCase();

    // 跳过非正文元素
    if (['script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside'].includes(tagName)) {
      return '';
    }

    // 块级元素前后加换行
    const blockTags = [
      'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'li', 'ul', 'ol', 'blockquote', 'pre', 'hr',
      'section', 'article', 'main', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
      'dl', 'dt', 'dd', 'details', 'summary',
    ];
    const isBlock = blockTags.includes(tagName);

    if (tagName === 'br') {
      text += '\n';
    } else if (tagName === 'img') {
      const alt = $(elem).attr('alt') || '';
      const src = $(elem).attr('src') || $(elem).attr('data-src') || '';
      if (src) text += `\n![${alt}](${src})\n`;
    } else if (tagName === 'a') {
      const href = $(elem).attr('href') || '';
      let linkText = '';
      if (elem.childNodes) {
        for (const child of elem.childNodes) {
          linkText += extractTextRecursive($, child);
        }
      }
      text += href ? `[${linkText}](${href})` : linkText;
    } else if (tagName === 'strong' || tagName === 'b') {
      let inner = '';
      if (elem.childNodes) {
        for (const child of elem.childNodes) {
          inner += extractTextRecursive($, child);
        }
      }
      text += `**${inner}**`;
    } else if (tagName === 'em' || tagName === 'i') {
      let inner = '';
      if (elem.childNodes) {
        for (const child of elem.childNodes) {
          inner += extractTextRecursive($, child);
        }
      }
      text += `*${inner}*`;
    } else {
      // 遍历子节点
      if (elem.childNodes && elem.childNodes.length > 0) {
        for (const child of elem.childNodes) {
          text += extractTextRecursive($, child);
        }
      }
    }

    if (isBlock && text.trim()) {
      text = `\n${text}\n`;
    }
  }

  return text;
}

/**
 * 解析本地 HTML 文件，提取正文内容
 *
 * @param {string} filePath 本地 HTML 文件绝对路径
 * @returns {Promise<{error: string, data: {title: string, content: string, source_url: string, cover_url: string, description: string}}>}
 */
export async function parseHtml(filePath) {
  // 1. 检查文件是否存在
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`文件不存在: ${filePath}`);
  }

  // 2. 读取文件内容
  let html;
  try {
    html = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`HTML 解析失败: ${err.message}`);
  }

  // 3. 用 cheerio 解析
  let $;
  try {
    $ = cheerio.load(html);
  } catch (err) {
    throw new Error(`HTML 解析失败: ${err.message}`);
  }

  // 4. 提取标题：优先 <title> → <h1> → 文件名
  let title = '';

  const titleTag = $('title').first();
  if (titleTag.length) {
    title = titleTag.text().trim();
  }

  if (!title) {
    const h1Tag = $('h1').first();
    if (h1Tag.length) {
      title = h1Tag.text().trim();
    }
  }

  if (!title) {
    title = path.basename(filePath);
  }

  // 5. 提取正文内容
  // 移除非正文元素
  $('script, style, noscript, nav, footer, header, aside, .nav, .footer, .header, .sidebar, .comment, .advertisement, #nav, #footer, #header, #sidebar, .menu, #menu').remove();

  const body = $('body').length ? $('body') : $.root();

  let content = '';
  // 遍历 body 的子节点，保留 main、article 优先
  const mainContent = body.find('main, article, [role="main"], .content, #content, .post, .article, .entry').first();

  if (mainContent.length > 0) {
    // 如果有明确的正文容器，只提取它
    for (const elem of mainContent.get()) {
      content += extractTextRecursive($, elem);
    }
  } else {
    // 否则提取整个 body
    for (const elem of body.children().get()) {
      content += extractTextRecursive($, elem);
    }
  }

  // 清理：去除多余空行、首尾空白
  content = content
    .replace(/\n{3,}/g, '\n\n') // 3个以上连续换行 → 2个
    .replace(/^[ \t]+/gm, '')    // 每行首空白
    .trim();

  // 6. 构造返回结果
  const result = {
    error: '0',
    data: {
      title,
      content,
      source_url: `file://${filePath}`,
      cover_url: '',
      description: '',
    },
  };

  return result;
}

/**
 * 解析 HTML 文件并写入缓存
 *
 * 解析结果写入: work_dir/scrape/local/<file-hash>/data.json
 *
 * @param {string} filePath 本地 HTML 文件绝对路径
 * @returns {Promise<{error: string, data: object, cachePath: string}>}
 */
export async function parseHtmlToCache(filePath) {
  const result = await parseHtml(filePath);

  const fileHash = generateFileHash(filePath);
  const cachePath = path.resolve(
    __dirname,
    '..',
    '..',
    'work_dir',
    'scrape',
    'local',
    fileHash,
    'data.json',
  );

  // 确保目录存在
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  // 写入缓存
  await fs.writeFile(cachePath, JSON.stringify(result, null, 2), 'utf-8');

  return { ...result, cachePath };
}

/**
 * MD/TXT 文件解析器
 *
 * 解析 .md 和 .txt 文件，输出与现有 scrape 一致的格式，
 * 并写入缓存路径 work_dir/scrape/local/<file-hash>/data.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFileType, generateFileHash } from '../file-path.js';

function normalizeDirname(dirname) {
    if (process.platform === 'win32' && dirname.startsWith('/') && dirname[2] === ':') {
        return dirname.slice(1);
    }
    return dirname;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = normalizeDirname(path.resolve(__dirname, '..', '..'));

/**
 * 解析 frontmatter 并返回 { title, content }
 *
 * @param {string} content 文件全文
 * @returns {{ title: string, content: string }}
 */
function parseFrontmatter(content) {
    const trimmed = content.trim();

    // 必须以 --- 开头才认为是 frontmatter
    if (!trimmed.startsWith('---')) {
        return { title: '', content: trimmed };
    }

    // 查找第二个 ---（frontmatter 结束标记）
    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) {
        // 没有闭合标记，整个文件当正文
        return { title: '', content: trimmed };
    }

    const frontmatterBlock = trimmed.substring(3, endIdx).trim();
    const body = trimmed.substring(endIdx + 3).trim();

    // 提取 title 字段（简单 key: value 解析，支持单引号/双引号/裸值）
    const titleMatch = frontmatterBlock.match(/^title:\s*(.+)$/m);
    let title = '';
    if (titleMatch) {
        title = titleMatch[1].trim();
        // 去掉引号
        if ((title.startsWith('"') && title.endsWith('"')) ||
            (title.startsWith("'") && title.endsWith("'"))) {
            title = title.slice(1, -1);
        }
    }

    return { title, content: body };
}

/**
 * 解析 .md 或 .txt 文件，输出与 scrape 一致的格式。
 *
 * @param {string} filePath 本地文件路径
 * @returns {Promise<{error: string, data: Object}>}
 */
export async function parseMdTxt(filePath) {
    // 1. 检测文件是否存在
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`文件不存在: ${absPath}`);
    }

    // 2. 检测文件类型
    const fileType = detectFileType(absPath);
    if (fileType !== 'md' && fileType !== 'txt') {
        throw new Error(`不支持的文件类型: ${fileType}，仅支持 md 和 txt`);
    }

    // 3. 读取文件内容
    let rawContent;
    try {
        rawContent = fs.readFileSync(absPath, 'utf-8');
    } catch (err) {
        throw new Error(`读取失败: ${err.message}`);
    }

    // 4. 根据文件类型解析
    let title = '';
    let content = '';

    if (fileType === 'md') {
        const parsed = parseFrontmatter(rawContent);
        title = parsed.title || path.basename(absPath, path.extname(absPath));
        content = parsed.content;
    } else {
        // .txt 文件
        title = path.basename(absPath, path.extname(absPath));
        content = rawContent.trim();
    }

    // 5. 构建结果对象
    const result = {
        error: '0',
        data: {
            title,
            content,
            source_url: `file://${absPath}`,
            cover_url: '',
            description: '',
        },
    };

    // 6. 写入缓存
    const fileHash = generateFileHash(absPath);
    const cacheDir = path.join(PROJECT_ROOT, 'work_dir', 'scrape', 'local', fileHash);
    const outputPath = path.join(cacheDir, 'data.json');

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    return result;
}

/**
 * 解析并写入缓存，返回带缓存路径的结果。
 *
 * @param {string} filePath 本地文件路径
 * @returns {Promise<{error: string, data: Object, cachePath: string}>}
 */
export async function parseMdTxtToCache(filePath) {
    const result = await parseMdTxt(filePath);
    const absPath = path.resolve(filePath);
    const fileHash = generateFileHash(absPath);
    const cachePath = path.join(PROJECT_ROOT, 'work_dir', 'scrape', 'local', fileHash, 'data.json');
    return { ...result, cachePath };
}

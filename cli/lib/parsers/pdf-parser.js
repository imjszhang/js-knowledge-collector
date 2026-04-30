/**
 * PDF 文件解析器
 *
 * 解析 .pdf 文件，提取文本内容，输出与现有 scrape 一致的格式，
 * 并写入缓存路径 work_dir/scrape/local/<file-hash>/data.json
 *
 * 依赖 pdf-parse v2.x（ESM 类 API）：
 *   new PDFParse(buffer) → .load() → .getText() / .getInfo()
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
 * 懒加载 pdf-parse（ESM 动态 import）
 *
 * @returns {Promise<typeof import('pdf-parse').PDFParse>} PDFParse 类
 * @throws {Error} 如果 pdf-parse 未安装
 */
async function loadPDFParse() {
    try {
        const mod = await import('pdf-parse');
        return mod.PDFParse;
    } catch {
        throw new Error('请先安装 pdf-parse 依赖：npm install pdf-parse');
    }
}

/**
 * 尝试从 PDF 元数据中提取标题
 *
 * @param {Object} info pdf-parse getInfo() 返回的信息对象
 * @param {string} fallbackPath 文件绝对路径（用于生成回退标题）
 * @returns {string} 提取的标题
 */
function extractTitle(info, fallbackPath) {
    // 从 info.info 中提取 Title
    if (info && info.info) {
        const meta = info.info;
        if (meta.Title && meta.Title.trim()) {
            return meta.Title.trim();
        }
    }

    // 从 metadata 中提取
    if (info && info.metadata) {
        const md = info.metadata;
        if (typeof md === 'string') {
            const titleMatch = md.match(/<(?:dc:)?title[^>]*>([^<]*)<\/(?:dc:)?title>/i)
                || md.match(/<xmp:Title[^>]*>([^<]*)<\/xmp:Title>/i);
            if (titleMatch && titleMatch[1].trim()) {
                return titleMatch[1].trim();
            }
        } else if (typeof md === 'object') {
            const titleKeys = ['Title', 'title', 'dc:title', 'xmp:Title'];
            for (const key of titleKeys) {
                const val = md[key];
                if (val && typeof val === 'string' && val.trim()) {
                    return val.trim();
                }
            }
        }
    }

    // 回退到文件名（不含扩展名）
    return path.basename(fallbackPath, path.extname(fallbackPath));
}

/**
 * 解析 .pdf 文件，输出与 scrape 一致的格式。
 *
 * @param {string} filePath 本地文件路径
 * @returns {Promise<{error: string, data: Object}>}
 */
export async function parsePdf(filePath) {
    // 1. 解析文件路径
    const absPath = path.resolve(filePath);

    // 2. 检测文件是否存在
    if (!fs.existsSync(absPath)) {
        throw new Error(`文件不存在: ${absPath}`);
    }

    // 3. 检测文件类型
    const fileType = detectFileType(absPath);
    if (fileType !== 'pdf') {
        throw new Error(`不支持的文件类型: ${fileType}，仅支持 pdf`);
    }

    // 4. 加载 pdf-parse
    const PDFParse = await loadPDFParse();

    // 5. 读取并解析 PDF
    let textContent, info;
    try {
        const fileBuffer = fs.readFileSync(absPath);
        const parser = new PDFParse(new Uint8Array(fileBuffer));
        await parser.load();
        const textResult = await parser.getText();
        info = await parser.getInfo();

        // textResult is { pages: [{page, text}, ...], text, total }
        if (textResult.pages && Array.isArray(textResult.pages)) {
            textContent = textResult.pages
                .map(p => (p.text || '').trim())
                .filter(Boolean)
                .join('\n\n');
        } else {
            textContent = textResult.text || '';
        }
    } catch (err) {
        throw new Error(`PDF 解析失败: ${err.message}`);
    }

    // 6. 提取标题和内容
    const title = extractTitle(info, absPath);
    const content = (textContent || '').trim();

    // 7. 构建结果对象
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

    // 8. 写入缓存
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
export async function parsePdfToCache(filePath) {
    const result = await parsePdf(filePath);
    const absPath = path.resolve(filePath);
    const fileHash = generateFileHash(absPath);
    const cachePath = path.join(PROJECT_ROOT, 'work_dir', 'scrape', 'local', fileHash, 'data.json');
    return { ...result, cachePath };
}

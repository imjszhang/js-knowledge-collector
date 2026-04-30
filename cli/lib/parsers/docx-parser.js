/**
 * DOCX 文件解析器
 *
 * 使用 mammoth 将 .docx 文件转换为纯文本，
 * 输出与现有 scrape 一致的格式，
 * 并写入缓存路径 work_dir/scrape/local/<file-hash>/data.json
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { generateFileHash } from '../file-path.js';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeDirname(dirname) {
    if (process.platform === 'win32' && dirname.startsWith('/') && dirname[2] === ':') {
        return dirname.slice(1);
    }
    return dirname;
}

const PROJECT_ROOT = normalizeDirname(path.resolve(__dirname, '..', '..'));

/**
 * 从 .docx（ZIP 文件）中提取 docProps/core.xml 的标题。
 * .docx 本质是 ZIP 归档，docProps/core.xml 包含 Dublin Core 元数据。
 *
 * @param {string} absPath .docx 文件绝对路径
 * @returns {string} 文档标题，找不到则返回空字符串
 */
function extractDocxTitle(absPath) {
    try {
        const buf = fs.readFileSync(absPath);

        // 查找 ZIP central directory 中 docProps/core.xml 的 local file header
        // ZIP local file header: signature(4) + version(2) + flags(2) + method(2) +
        //   modTime(2) + modDate(2) + crc32(4) + compressedSize(4) + uncompressedSize(4) +
        //   fileNameLen(2) + extraLen(2) + fileName + extra + compressedData
        const ZIP_SIG = 0x04034b50;
        let offset = 0;
        let maxIterations = buf.length;

        while (offset < buf.length - 4 && maxIterations-- > 0) {
            const sig = buf.readUInt32LE(offset);
            if (sig !== ZIP_SIG) {
                offset++;
                continue;
            }

            const fileNameLen = buf.readUInt16LE(offset + 26);
            const extraLen = buf.readUInt16LE(offset + 28);
            const method = buf.readUInt16LE(offset + 8);
            const compressedSize = buf.readUInt32LE(offset + 18);
            const dataStart = offset + 30 + fileNameLen + extraLen;

            const fileName = buf.toString('utf8', offset + 30, offset + 30 + fileNameLen);

            if (fileName === 'docProps/core.xml') {
                let xmlContent;

                if (method === 0) {
                    // Stored (no compression)
                    xmlContent = buf.toString('utf8', dataStart, dataStart + compressedSize);
                } else if (method === 8) {
                    // Deflate
                    const compressed = buf.subarray(dataStart, dataStart + compressedSize);
                    xmlContent = zlib.inflateRawSync(compressed).toString('utf8');
                } else {
                    return '';
                }

                // 从 XML 中提取 dc:title
                const titleMatch = xmlContent.match(/<dc:title>([^<]*)<\/dc:title>/);
                return titleMatch ? titleMatch[1].trim() : '';
            }

            offset = dataStart + compressedSize;
        }
    } catch {
        // 静默失败，回退到文件名
    }
    return '';
}

/**
 * 解析 .docx 文件，输出与 scrape 一致的格式。
 *
 * @param {string} filePath 本地文件路径
 * @returns {Promise<{ outputPath: string, result: Object }>}
 */
export async function parseDocx(filePath) {
    // 1. 检测文件是否存在
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`文件不存在: ${absPath}`);
    }

    // 2. 检查 mammoth 依赖
    let mammoth;
    try {
        mammoth = await import('mammoth');
    } catch {
        throw new Error('请先安装 mammoth 依赖：npm install mammoth');
    }

    // 3. 解析 DOCX 提取纯文本
    let rawText;
    try {
        const result = await mammoth.extractRawText({ path: absPath });
        rawText = result.value;
    } catch (err) {
        throw new Error(`DOCX 解析失败: ${err.message}`);
    }

    // 4. 提取标题：优先从文档属性中提取，回退到文件名（不含扩展名）
    const docTitle = extractDocxTitle(absPath);
    const title = docTitle || path.basename(absPath, path.extname(absPath));

    const content = rawText.trim();

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
export async function parseDocxToCache(filePath) {
    const result = await parseDocx(filePath);
    const absPath = path.resolve(filePath);
    const fileHash = generateFileHash(absPath);
    const cachePath = path.join(PROJECT_ROOT, 'work_dir', 'scrape', 'local', fileHash, 'data.json');
    return { ...result, cachePath };
}

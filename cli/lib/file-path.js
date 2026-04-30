/**
 * File Path Detection & Metadata Utility
 *
 * Detects whether an input is a local file path or URL,
 * resolves paths, detects file types, and generates cache identifiers.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 兼容 Windows 上 fileURLToPath 可能返回带前导 / 的路径
function normalizeDirname(dirname) {
    if (process.platform === 'win32' && dirname.startsWith('/') && dirname[2] === ':') {
        return dirname.slice(1); // /D:/... → D:/...
    }
    return dirname;
}

const PROJECT_DIR = normalizeDirname(path.resolve(__dirname, '..', '..'));

const SUPPORTED_TYPES = {
    '.md': 'md',
    '.txt': 'txt',
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.html': 'html',
    '.htm': 'html',
};

/**
 * Detect whether input is a local file path.
 *
 * @param {string} input
 * @returns {boolean}
 */
export function isLocalPath(input) {
    if (!input || typeof input !== 'string') return false;
    if (input.startsWith('file://')) return true;
    if (input.includes('\\')) return true;
    if (input.startsWith('/') && !input.startsWith('http')) return true;
    if (input.startsWith('./') || input.startsWith('../')) return true;
    // Windows drive letter: D:\ or D:/
    if (/^[a-zA-Z]:[\\/]/.test(input)) return true;
    // Fallback: check if the resolved path exists on disk
    try {
        if (fs.existsSync(path.resolve(input))) return true;
    } catch { /* ignore fs errors */ }
    return false;
}

/**
 * Resolve input to an absolute file path.
 *
 * @param {string} input
 * @returns {string} absolute path
 */
export function resolveFilePath(input) {
    if (input.startsWith('file://')) {
        return input.slice(7);
    }
    return path.resolve(input);
}

/**
 * Detect file type by extension.
 *
 * @param {string} filePath
 * @returns {string} 'md' | 'txt' | 'pdf' | 'docx' | 'html'
 * @throws {Error} if extension not supported
 */
export function detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = SUPPORTED_TYPES[ext];
    if (!type) {
        throw new Error(`不支持的文件类型: ${ext || '(无扩展名)'}，支持: ${Object.keys(SUPPORTED_TYPES).join(', ')}`);
    }
    return type;
}

/**
 * Generate a cache hash for a file based on absolute path + mtime.
 *
 * @param {string} filePath absolute file path
 * @returns {string} 16-char hex hash
 */
export function generateFileHash(filePath) {
    const absPath = path.resolve(filePath);
    let mtime = '';
    try {
        const stat = fs.statSync(absPath);
        mtime = stat.mtimeMs.toString();
    } catch {
        // File doesn't exist yet, just hash the path
    }
    const raw = `${absPath}|${mtime}`;
    return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
}

/**
 * Get the cache category directory name for a file type.
 * All local file types map to 'local'.
 *
 * @param {string} _fileType
 * @returns {string} 'local'
 */
export function getFileCategory(_fileType) {
    return 'local';
}

/**
 * Get the cache path for a file.
 *
 * @param {string} filePath absolute file path
 * @returns {string} work_dir/scrape/local/<hash>/data.json
 */
export function getCachePath(filePath) {
    const fileHash = generateFileHash(filePath);
    return path.join(PROJECT_DIR, 'work_dir', 'scrape', 'local', fileHash, 'data.json');
}

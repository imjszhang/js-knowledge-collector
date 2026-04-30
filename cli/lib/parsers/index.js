/**
 * File parsers — unified entry point.
 *
 * Each parser reads a local file and returns data in the same format as scrape:
 * { error: '0', data: { title, content, source_url, cover_url, description } }
 */

/** @type {typeof import('./md-txt-parser.js').parseMdTxt | null} */
let parseMdTxt = null;
try { parseMdTxt = (await import('./md-txt-parser.js')).parseMdTxt; } catch { /* not yet implemented */ }

/** @type {typeof import('./pdf-parser.js').parsePdf | null} */
let parsePdf = null;
try { parsePdf = (await import('./pdf-parser.js')).parsePdf; } catch { /* not yet implemented */ }

/** @type {typeof import('./docx-parser.js').parseDocx | null} */
let parseDocx = null;
try { parseDocx = (await import('./docx-parser.js')).parseDocx; } catch { /* not yet implemented */ }

/** @type {typeof import('./html-parser.js').parseHtml | null} */
let parseHtml = null;
try { parseHtml = (await import('./html-parser.js')).parseHtml; } catch { /* not yet implemented */ }

const PARSERS = {
    md: parseMdTxt,
    txt: parseMdTxt,
    pdf: parsePdf,
    docx: parseDocx,
    html: parseHtml,
};

/**
 * Parse a local file and return scrape-compatible data.
 *
 * @param {string} filePath absolute file path
 * @param {string} fileType 'md' | 'txt' | 'pdf' | 'docx' | 'html'
 * @returns {Promise<{error: string, data: Object}>}
 */
export async function parseFile(filePath, fileType) {
    const parser = PARSERS[fileType];
    if (!parser) {
        const missing = fileType === 'pdf' ? 'pdf-parse' : fileType === 'docx' ? 'mammoth' : 'parser';
        throw new Error(`${fileType.toUpperCase()} 解析器尚未实现。${fileType === 'pdf' || fileType === 'docx' ? `请先安装依赖: npm install ${missing}` : '请先创建对应的解析器模块'}`);
    }
    return parser(filePath);
}

#!/usr/bin/env node

/**
 * Bilibili 视频信息抓取脚本
 * 
 * 使用 yt-dlp 获取 Bilibili 视频的完整信息（元数据、字幕等）
 * 可选择同时下载视频
 * 
 * 前置条件:
 *   1. 安装 yt-dlp:
 *      .venv\Scripts\pip.exe install yt-dlp
 * 
 *   2. 安装 ffmpeg（用于视频格式转换和修复，下载视频时推荐）:
 *      winget install ffmpeg
 * 
 * 使用方法:
 *   node scripts/scrapeBilibili.js <Bilibili-URL> [options]
 * 
 * 选项:
 *   --output <file>               指定输出文件名（默认保存到 work_dir/scrape/bilibili 目录）
 *   --pretty                      美化 JSON 输出
 *   --download                    同时下载视频
 *   --audio-only                  仅下载音频（需配合 --download）
 *   --sub-langs <langs>           字幕语言（默认 zh-Hans,zh-Hant）
 *   --no-subtitles                不获取字幕
 *   --cookies-from-browser <name> 从浏览器读取 cookies（默认 firefox）
 *   --no-cookies                  不使用 cookies
 *   --from-json <file>            从已保存的 JSON 文件读取视频 URL（用于下载视频）
 *   --extract-subtitle            从已下载的视频文件中提取字幕
 *   --subtitle-output <file>      指定字幕输出文件路径（配合 --extract-subtitle 使用）
 *   --subtitle-format <format>    字幕格式：srt, vtt, txt（默认：srt，配合 --extract-subtitle 使用）
 * 
 * 文件保存位置:
 *   - 视频信息: work_dir/scrape/bilibili/{VIDEO_ID}.json
 *   - 下载的视频: work_dir/scrape/bilibili/{VIDEO_ID}.{ext}
 * 
 * 示例:
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/av12345678
 *   node scripts/scrapeBilibili.js https://b23.tv/xxxxx --pretty
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --download
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --download --audio-only
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --sub-langs "zh-Hans"
 *   node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --cookies-from-browser chrome
 *   node scripts/scrapeBilibili.js --from-json BV1234567890.json --download
 *   node scripts/scrapeBilibili.js --from-json work_dir/scrape/bilibili/BV1234567890.json --download --audio-only
 *   node scripts/scrapeBilibili.js --from-json BV1s814YTEjg.json --extract-subtitle
 *   node scripts/scrapeBilibili.js --from-json BV1s814YTEjg.json --extract-subtitle --subtitle-format txt
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const fsPromises = fs.promises;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// yt-dlp 可执行文件路径（在 .venv 虚拟环境中）
const YTDLP_PATH = path.join(__dirname, '..', '.venv', 'Scripts', 'yt-dlp.exe');

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        url: null,
        output: null,
        pretty: false,
        download: false,
        audioOnly: false,
        subLangs: 'zh-Hans,zh-Hant,ai-zh',
        noSubtitles: false,
        cookiesFromBrowser: 'firefox',
        noCookies: false,
        fromJson: null,
        extractSubtitle: false,
        subtitleOutput: null,
        subtitleFormat: 'srt'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            const key = arg.replace('--', '').replace(/-/g, '');
            const nextArg = args[i + 1];
            
            switch (key) {
                case 'output':
                    options.output = nextArg;
                    i++;
                    break;
                case 'pretty':
                    options.pretty = true;
                    break;
                case 'download':
                    options.download = true;
                    break;
                case 'audioonly':
                    options.audioOnly = true;
                    break;
                case 'sublangs':
                    options.subLangs = nextArg;
                    i++;
                    break;
                case 'nosubtitles':
                    options.noSubtitles = true;
                    break;
                case 'cookiesfrombrowser':
                    options.cookiesFromBrowser = nextArg;
                    i++;
                    break;
                case 'nocookies':
                    options.noCookies = true;
                    break;
                case 'fromjson':
                    options.fromJson = nextArg;
                    i++;
                    break;
                case 'extractsubtitle':
                    options.extractSubtitle = true;
                    break;
                case 'subtitleoutput':
                    options.subtitleOutput = nextArg;
                    i++;
                    break;
                case 'subtitleformat':
                    options.subtitleFormat = nextArg;
                    i++;
                    break;
                default:
                    console.warn(`未知选项: ${arg}`);
            }
        } else if (!options.url && !options.fromJson) {
            options.url = arg;
        }
    }

    return options;
}

/**
 * 从 Bilibili URL 中提取视频 ID（BV号或AV号）
 * @param {string} url Bilibili URL
 * @returns {string|null} 视频 ID（BV号或AV号）
 */
function extractVideoId(url) {
    const patterns = [
        // BV号格式: BV1234567890
        /bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/i,
        // AV号格式: av12345678 或 AV12345678
        /bilibili\.com\/video\/(av\d+)/i,
        // 短链接 b23.tv 格式（需要解析后才能获取，这里先匹配）
        /b23\.tv\/([a-zA-Z0-9]+)/i,
        // 移动端链接
        /m\.bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/i,
        /m\.bilibili\.com\/video\/(av\d+)/i
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1].toUpperCase();
        }
    }

    return null;
}

/**
 * 检查 yt-dlp 是否可用
 * @returns {Promise<boolean>}
 */
async function checkYtDlp() {
    // 检查 .venv 中的 yt-dlp
    if (fs.existsSync(YTDLP_PATH)) {
        return true;
    }
    
    // 检查系统 PATH 中的 yt-dlp
    return new Promise((resolve) => {
        const proc = spawn('yt-dlp', ['--version'], { shell: false, stdio: 'ignore' });
        proc.on('close', (code) => {
            resolve(code === 0);
        });
        proc.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * 获取 yt-dlp 命令路径
 * @returns {string}
 */
function getYtDlpCommand() {
    if (fs.existsSync(YTDLP_PATH)) {
        return YTDLP_PATH;
    }
    return 'yt-dlp';
}

/**
 * 检查 ffmpeg 是否可用
 * @returns {Promise<{available: boolean, version?: string}>}
 */
async function checkFfmpeg() {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-version'], { shell: false, stdio: 'pipe' });
        let output = '';
        
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                // 提取版本信息（第一行）
                const versionLine = output.split('\n')[0] || 'unknown';
                resolve({
                    available: true,
                    version: versionLine
                });
            } else {
                resolve({ available: false });
            }
        });
        
        proc.on('error', () => {
            resolve({ available: false });
        });
        
        // 设置超时，避免长时间等待
        setTimeout(() => {
            proc.kill();
            resolve({ available: false });
        }, 3000);
    });
}

/**
 * 格式化输出结果
 * @param {Object} result 结果对象
 * @param {boolean} pretty 是否美化输出
 * @returns {string} JSON 字符串
 */
function formatOutput(result, pretty = false) {
    if (pretty) {
        return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result);
}

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 */
async function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            await fsPromises.mkdir(dirPath, { recursive: true });
            console.log(`已创建目录: ${dirPath}`);
        }
    } catch (error) {
        console.error(`创建目录失败: ${error.message}`);
        throw error;
    }
}

/**
 * 保存结果到文件
 * @param {string} filePath 文件路径
 * @param {string} data 数据内容
 */
async function saveToFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        await ensureDirectoryExists(dir);
        await fsPromises.writeFile(filePath, data, 'utf-8');
        console.log(`\n结果已保存到: ${filePath}`);
    } catch (error) {
        console.error(`保存文件失败: ${error.message}`);
        throw error;
    }
}

/**
 * 使用 yt-dlp 获取视频元数据
 * @param {string} url 视频 URL
 * @param {Object} options 选项
 * @returns {Promise<Object>} 视频元数据
 */
async function getVideoInfo(url, options = {}) {
    const ytdlpCmd = getYtDlpCommand();
    
    const args = [
        url,
        '--dump-json',
        '--no-download',
        '--no-playlist'
    ];
    
    // 从浏览器读取 cookies
    if (!options.noCookies && options.cookiesFromBrowser) {
        args.push('--cookies-from-browser', options.cookiesFromBrowser);
    }
    
    console.log(`执行命令: ${ytdlpCmd} ${args.join(' ')}\n`);
    
    return new Promise((resolve, reject) => {
        const proc = spawn(ytdlpCmd, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: false
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            // 只显示错误信息，不显示警告
            if (output.toLowerCase().includes('error')) {
                process.stderr.write(output);
            }
        });
        
        proc.on('close', (code) => {
            if (code === 0 && stdout) {
                try {
                    const info = JSON.parse(stdout);
                    resolve(info);
                } catch (e) {
                    reject(new Error(`解析视频信息失败: ${e.message}`));
                }
            } else {
                reject(new Error(`yt-dlp 退出码: ${code}\n${stderr}`));
            }
        });
        
        proc.on('error', (error) => {
            reject(new Error(`启动 yt-dlp 失败: ${error.message}`));
        });
    });
}

/**
 * 获取视频字幕
 * @param {string} url 视频 URL
 * @param {string} videoId 视频 ID
 * @param {Object} options 选项
 * @returns {Promise<Object>} 字幕内容 { langCode: content }
 */
async function getSubtitles(url, videoId, options = {}) {
    const ytdlpCmd = getYtDlpCommand();
    const tempDir = path.join(os.tmpdir(), `bili-subs-${videoId}-${Date.now()}`);
    
    try {
        // 创建临时目录
        await fsPromises.mkdir(tempDir, { recursive: true });
        
        const args = [
            url,
            '--write-subs',
            '--write-auto-subs',
            '--sub-langs', options.subLangs || 'zh-Hans,zh-Hant',
            '--skip-download',
            '--no-playlist',
            '-o', path.join(tempDir, '%(id)s.%(ext)s')
        ];
        
        // 从浏览器读取 cookies
        if (!options.noCookies && options.cookiesFromBrowser) {
            args.push('--cookies-from-browser', options.cookiesFromBrowser);
        }
        
        console.log(`获取字幕: ${ytdlpCmd} ${args.join(' ')}\n`);
        
        await new Promise((resolve, reject) => {
            const proc = spawn(ytdlpCmd, args, {
                stdio: ['inherit', 'pipe', 'pipe'],
                shell: false
            });
            
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
                process.stdout.write(data);
            });
            
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            proc.on('close', (code) => {
                // 字幕下载即使失败也继续（可能没有字幕）
                resolve();
            });
            
            proc.on('error', (error) => {
                console.warn(`获取字幕警告: ${error.message}`);
                resolve();
            });
        });
        
        // 读取字幕文件
        const subtitles = {};
        const files = await fsPromises.readdir(tempDir);
        
        for (const file of files) {
            // 字幕文件格式: videoId.langCode.vtt 或 videoId.langCode.srt
            const match = file.match(/\.([a-zA-Z-]+)\.(vtt|srt|json3|srv[123]|ttml)$/);
            if (match) {
                const langCode = match[1];
                const filePath = path.join(tempDir, file);
                try {
                    const content = await fsPromises.readFile(filePath, 'utf-8');
                    // 清理 VTT/SRT 格式，提取纯文本
                    subtitles[langCode] = cleanSubtitleContent(content, match[2]);
                } catch (e) {
                    console.warn(`读取字幕文件 ${file} 失败: ${e.message}`);
                }
            }
        }
        
        // 清理临时目录
        await fsPromises.rm(tempDir, { recursive: true, force: true });
        
        return subtitles;
        
    } catch (error) {
        // 清理临时目录
        try {
            await fsPromises.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            // 忽略清理错误
        }
        console.warn(`获取字幕失败: ${error.message}`);
        return {};
    }
}

/**
 * 检查视频文件中的字幕轨道
 * @param {string} videoFile 视频文件路径
 * @returns {Promise<Array>} 字幕轨道列表
 */
async function checkSubtitleTracks(videoFile) {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-i', videoFile], {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let stderr = '';
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', () => {
            // 查找字幕轨道
            const subtitleMatches = stderr.match(/Stream #\d+:\d+.*: Subtitle: ([^\n]+)/g);
            const tracks = [];
            
            if (subtitleMatches) {
                subtitleMatches.forEach((match, index) => {
                    const streamMatch = match.match(/Stream #(\d+):(\d+)/);
                    const codecMatch = match.match(/Subtitle: ([^\s]+)/);
                    if (streamMatch && codecMatch) {
                        tracks.push({
                            index: index,
                            streamIndex: streamMatch[2],
                            codec: codecMatch[1]
                        });
                    }
                });
            }
            
            resolve(tracks);
        });
        
        proc.on('error', () => {
            resolve([]);
        });
    });
}

/**
 * 从视频文件中提取字幕
 * @param {string} videoFile 视频文件路径
 * @param {string} outputFile 输出字幕文件路径
 * @param {string} format 字幕格式（srt, vtt, txt）
 * @returns {Promise<string>} 输出文件路径
 */
async function extractSubtitleFromVideo(videoFile, outputFile, format = 'srt') {
    const tracks = await checkSubtitleTracks(videoFile);
    
    if (tracks.length === 0) {
        throw new Error('视频文件中未找到字幕轨道');
    }
    
    console.log(`找到 ${tracks.length} 个字幕轨道，提取第一个...`);
    
    // 提取第一个字幕轨道
    const track = tracks[0];
    const streamIndex = track.streamIndex;
    
    // 根据格式选择输出格式
    let outputFormat = format;
    let tempOutputFile = outputFile;
    if (format === 'txt') {
        outputFormat = 'srt'; // 先提取为 srt，再转换为 txt
        tempOutputFile = outputFile.replace(/\.txt$/i, '.srt');
    }
    
    return new Promise((resolve, reject) => {
        const args = [
            '-i', videoFile,
            '-map', `0:${streamIndex}`,
            '-c:s', 'copy',
            '-y',
            tempOutputFile
        ];
        
        const proc = spawn('ffmpeg', args, {
            shell: false,
            stdio: 'pipe'
        });
        
        let stderr = '';
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', async (code) => {
            if (code === 0) {
                // 如果需要转换为 txt，读取 srt 并转换为纯文本
                if (format === 'txt') {
                    try {
                        const srtContent = await fsPromises.readFile(tempOutputFile, 'utf-8');
                        const txtContent = srtToText(srtContent);
                        await fsPromises.writeFile(outputFile, txtContent, 'utf-8');
                        await fsPromises.unlink(tempOutputFile);
                        resolve(outputFile);
                    } catch (e) {
                        reject(new Error(`转换字幕格式失败: ${e.message}`));
                    }
                } else {
                    resolve(tempOutputFile);
                }
            } else {
                reject(new Error(`ffmpeg 提取失败: ${stderr}`));
            }
        });
        
        proc.on('error', (error) => {
            reject(new Error(`启动 ffmpeg 失败: ${error.message}`));
        });
    });
}

/**
 * 将 SRT 格式转换为纯文本
 * @param {string} srtContent SRT 字幕内容
 * @returns {string} 纯文本内容
 */
function srtToText(srtContent) {
    const lines = srtContent.split('\n');
    const textLines = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        // 跳过序号行
        if (/^\d+$/.test(trimmed)) {
            continue;
        }
        // 跳过时间戳行
        if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) {
            continue;
        }
        // 跳过空行和标签
        if (!trimmed || trimmed.startsWith('<')) {
            continue;
        }
        // 移除 HTML 标签
        const cleanLine = trimmed.replace(/<[^>]+>/g, '').trim();
        if (cleanLine && !textLines.includes(cleanLine)) {
            textLines.push(cleanLine);
        }
    }
    
    return textLines.join('\n');
}

/**
 * 清理字幕内容，提取纯文本
 * @param {string} content 字幕文件内容
 * @param {string} format 字幕格式
 * @returns {string} 清理后的纯文本
 */
function cleanSubtitleContent(content, format) {
    if (format === 'vtt') {
        // 移除 VTT 头部和时间戳
        const lines = content.split('\n');
        const textLines = [];
        let skipNext = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            // 跳过 WEBVTT 头部
            if (trimmed.startsWith('WEBVTT') || trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) {
                continue;
            }
            // 跳过时间戳行
            if (/^\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[\.,]\d{3}/.test(trimmed)) {
                continue;
            }
            // 跳过序号行
            if (/^\d+$/.test(trimmed)) {
                continue;
            }
            // 跳过空行
            if (!trimmed) {
                continue;
            }
            // 移除 VTT 标签（如 <c>、</c>、<00:00:00.000> 等）
            const cleanLine = trimmed.replace(/<[^>]+>/g, '').trim();
            if (cleanLine && !textLines.includes(cleanLine)) {
                textLines.push(cleanLine);
            }
        }
        
        return textLines.join('\n');
    } else if (format === 'srt') {
        // 移除 SRT 序号和时间戳
        const lines = content.split('\n');
        const textLines = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            // 跳过序号行
            if (/^\d+$/.test(trimmed)) {
                continue;
            }
            // 跳过时间戳行
            if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) {
                continue;
            }
            // 跳过空行
            if (!trimmed) {
                continue;
            }
            if (!textLines.includes(trimmed)) {
                textLines.push(trimmed);
            }
        }
        
        return textLines.join('\n');
    }
    
    // 其他格式返回原内容
    return content;
}

/**
 * 下载视频
 * @param {string} url 视频 URL
 * @param {string} outputPath 输出路径
 * @param {Object} options 选项
 * @returns {Promise<string>} 下载的文件路径
 */
async function downloadVideo(url, outputPath, options = {}) {
    const ytdlpCmd = getYtDlpCommand();
    
    const args = [url];
    
    // 输出路径
    args.push('-o', outputPath);
    
    // 格式选择
    if (options.audioOnly) {
        args.push('-f', 'bestaudio[ext=m4a]/bestaudio/best');
        args.push('-x');
        args.push('--audio-format', 'mp3');
    } else {
        // 优先选择不需要合并的格式，避免 HLS 流格式
        // 格式优先级：1. 单个 mp4 文件 2. webm 格式 3. 需要合并的格式（需要 ffmpeg）
        args.push('-f', 'best[ext=mp4][protocol!=m3u8]/best[ext=webm][protocol!=m3u8]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
        // 如果必须合并，指定输出格式为 mp4
        args.push('--merge-output-format', 'mp4');
    }
    
    args.push('--no-playlist');
    args.push('--progress');
    // 根据 ffmpeg 是否可用设置修复选项
    if (options.ffmpegAvailable) {
        // 如果 ffmpeg 可用，使用 detect_or_warn 自动检测并修复问题
        args.push('--fixup', 'detect_or_warn');
    } else {
        // 如果 ffmpeg 不可用，只警告不修复
        args.push('--fixup', 'warn');
    }
    
    // 从浏览器读取 cookies
    if (!options.noCookies && options.cookiesFromBrowser) {
        args.push('--cookies-from-browser', options.cookiesFromBrowser);
    }
    
    console.log(`\n下载视频: ${ytdlpCmd} ${args.join(' ')}\n`);
    
    return new Promise((resolve, reject) => {
        const proc = spawn(ytdlpCmd, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: false
        });
        
        let stdout = '';
        let downloadedFile = null;
        
        proc.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            process.stdout.write(output);
            
            // 尝试从输出中提取下载的文件名
            const destMatch = output.match(/\[download\] Destination: (.+)/);
            if (destMatch) {
                downloadedFile = destMatch[1].trim();
            }
            
            // 合并完成后的文件名
            const mergeMatch = output.match(/\[Merger\] Merging formats into "(.+)"/);
            if (mergeMatch) {
                downloadedFile = mergeMatch[1].trim();
            }
            
            // 已存在的文件
            const existsMatch = output.match(/\[download\] (.+) has already been downloaded/);
            if (existsMatch) {
                downloadedFile = existsMatch[1].trim();
            }
        });
        
        proc.stderr.on('data', (data) => {
            process.stderr.write(data);
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(downloadedFile);
            } else {
                reject(new Error(`视频下载失败，退出码: ${code}`));
            }
        });
        
        proc.on('error', (error) => {
            reject(new Error(`启动 yt-dlp 失败: ${error.message}`));
        });
    });
}

/**
 * 格式化时长
 * @param {number} seconds 秒数
 * @returns {string} 格式化后的时长
 */
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化数字
 * @param {number} num 数字
 * @returns {string} 格式化后的数字
 */
function formatNumber(num) {
    if (num === undefined || num === null) return 'N/A';
    return num.toLocaleString();
}

/**
 * 从 JSON 文件读取视频 URL
 * @param {string} jsonPath JSON 文件路径
 * @returns {Promise<{url: string, videoId: string, data?: Object}>} 视频 URL 和 ID
 */
async function readUrlFromJson(jsonPath) {
    try {
        // 处理相对路径和绝对路径
        let fullPath = jsonPath;
        if (!path.isAbsolute(jsonPath)) {
            // 如果不是绝对路径，先尝试相对于当前工作目录
            if (!fs.existsSync(jsonPath)) {
                const workDir = path.join(process.cwd(), 'work_dir', 'scrape', 'bilibili');
                
                // 尝试多个位置：
                // 1. 直接在工作目录
                // 2. 在子目录中（如果 JSON 文件名包含视频 ID）
                const possiblePaths = [
                    path.join(workDir, jsonPath)
                ];
                
                // 如果 JSON 文件名看起来像视频 ID，也在子目录中查找
                const jsonBaseName = path.basename(jsonPath, path.extname(jsonPath));
                if (jsonBaseName.match(/^(BV|av)/i)) {
                    possiblePaths.push(path.join(workDir, jsonBaseName, jsonPath));
                    possiblePaths.push(path.join(workDir, jsonBaseName, path.basename(jsonPath)));
                }
                
                // 查找第一个存在的路径
                for (const possiblePath of possiblePaths) {
                    if (fs.existsSync(possiblePath)) {
                        fullPath = possiblePath;
                        break;
                    }
                }
                
                // 如果还是没找到，使用第一个可能的路径（用于错误提示）
                if (!fs.existsSync(fullPath)) {
                    fullPath = possiblePaths[0];
                }
            }
        }
        
        if (!fs.existsSync(fullPath)) {
            throw new Error(`JSON 文件不存在: ${fullPath}`);
        }
        
        const content = await fsPromises.readFile(fullPath, 'utf-8');
        const jsonData = JSON.parse(content);
        
        // 检查 JSON 格式
        if (!jsonData.data) {
            throw new Error('JSON 文件格式不正确：缺少 data 字段');
        }
        
        const data = jsonData.data;
        
        // 优先使用 webpage_url，其次使用 original_url
        const url = data.webpage_url || data.original_url;
        if (!url) {
            throw new Error('JSON 文件中未找到视频 URL（webpage_url 或 original_url）');
        }
        
        // 提取视频 ID
        const videoId = data.id || extractVideoId(url);
        if (!videoId) {
            throw new Error('无法从 JSON 文件中提取视频 ID');
        }
        
        return {
            url,
            videoId,
            data
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`JSON 文件不存在: ${jsonPath}`);
        }
        if (error instanceof SyntaxError) {
            throw new Error(`JSON 文件格式错误: ${error.message}`);
        }
        throw error;
    }
}

/**
 * 主函数
 */
async function main() {
    const options = parseArgs();

    let videoId = null;
    let jsonData = null;

    // 如果指定了 --from-json，从 JSON 文件读取 URL
    if (options.fromJson) {
        try {
            console.log(`从 JSON 文件读取视频信息: ${options.fromJson}\n`);
            const jsonInfo = await readUrlFromJson(options.fromJson);
            options.url = jsonInfo.url;
            videoId = jsonInfo.videoId;
            jsonData = jsonInfo.data;
            console.log(`✓ 成功读取 JSON 文件`);
            console.log(`  视频 URL: ${options.url}`);
            console.log(`  视频 ID: ${videoId}\n`);
        } catch (error) {
            console.error(`\n错误: 无法从 JSON 文件读取视频信息`);
            console.error(error.message);
            process.exit(1);
        }
    }

    // 检查URL参数（提取字幕时不需要 URL）
    if (!options.url && !options.fromJson && !options.extractSubtitle) {
        console.error('错误: 请提供 Bilibili 视频 URL 或使用 --from-json 选项，或使用 --extract-subtitle 从视频文件提取字幕');
        console.log('\n使用方法:');
        console.log('  node scripts/scrapeBilibili.js <Bilibili-URL> [options]');
        console.log('  node scripts/scrapeBilibili.js --from-json <JSON文件> [options]');
        console.log('  node scripts/scrapeBilibili.js --from-json <JSON文件> --extract-subtitle');
        console.log('\n选项:');
        console.log('  --output <file>               指定输出文件名（默认保存到 work_dir/scrape/bilibili 目录）');
        console.log('  --pretty                      美化 JSON 输出');
        console.log('  --download                    同时下载视频');
        console.log('  --audio-only                  仅下载音频（需配合 --download）');
        console.log('  --sub-langs <langs>           字幕语言（默认 zh-Hans,zh-Hant）');
        console.log('  --no-subtitles                不获取字幕');
        console.log('  --cookies-from-browser <name> 从浏览器读取 cookies（默认 firefox）');
        console.log('                                支持: firefox, chrome, edge, opera, brave, vivaldi, safari');
        console.log('  --no-cookies                  不使用 cookies');
        console.log('  --from-json <file>            从已保存的 JSON 文件读取视频 URL（用于下载视频）');
        console.log('  --extract-subtitle            从已下载的视频文件中提取字幕');
        console.log('  --subtitle-output <file>      指定字幕输出文件路径（配合 --extract-subtitle 使用）');
        console.log('  --subtitle-format <format>    字幕格式：srt, vtt, txt（默认：srt，配合 --extract-subtitle 使用）');
        console.log('\n示例:');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/av12345678');
        console.log('  node scripts/scrapeBilibili.js https://b23.tv/xxxxx --pretty');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --download');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --download --audio-only');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --sub-langs "zh-Hans"');
        console.log('  node scripts/scrapeBilibili.js https://www.bilibili.com/video/BV1234567890 --cookies-from-browser chrome');
        console.log('  node scripts/scrapeBilibili.js --from-json BV1234567890.json --download');
        console.log('  node scripts/scrapeBilibili.js --from-json work_dir/scrape/bilibili/BV1234567890.json --download --audio-only');
        console.log('  node scripts/scrapeBilibili.js --from-json BV1s814YTEjg.json --extract-subtitle');
        console.log('  node scripts/scrapeBilibili.js --from-json BV1s814YTEjg.json --extract-subtitle --subtitle-format txt');
        process.exit(1);
    }

    // 如果只是提取字幕，直接处理并退出
    if (options.extractSubtitle) {
        if (!options.fromJson) {
            console.error('错误: --extract-subtitle 需要配合 --from-json 使用');
            console.log('示例: node scripts/scrapeBilibili.js --from-json BV1s814YTEjg.json --extract-subtitle');
            process.exit(1);
        }

        try {
            // 如果之前已经读取过 JSON，直接使用；否则重新读取
            let jsonInfo;
            let videoIdForSubtitle;
            if (jsonData && videoId) {
                jsonInfo = { url: options.url, videoId: videoId, data: jsonData };
                videoIdForSubtitle = videoId;
            } else {
                console.log(`从 JSON 文件读取视频信息: ${options.fromJson}\n`);
                jsonInfo = await readUrlFromJson(options.fromJson);
                videoIdForSubtitle = jsonInfo.videoId;
            }
            
            // 查找视频文件（优先在子目录中查找，如果不存在再查找根目录）
            const workDir = path.join(process.cwd(), 'work_dir', 'scrape', 'bilibili');
            const videoSubDir = path.join(workDir, videoIdForSubtitle);
            let videoFile = null;
            
            // 先检查子目录是否存在
            let searchDirs = [];
            if (fs.existsSync(videoSubDir)) {
                try {
                    const stat = await fsPromises.stat(videoSubDir);
                    if (stat.isDirectory()) {
                        searchDirs.push(videoSubDir);
                    }
                } catch (e) {
                    // 忽略错误，继续在根目录查找
                }
            }
            // 也检查根目录
            searchDirs.push(workDir);
            
            // 在多个目录中查找视频文件（不区分大小写）
            for (const searchDir of searchDirs) {
                try {
                    const files = await fsPromises.readdir(searchDir);
                    for (const file of files) {
                        const fileBaseName = path.basename(file, path.extname(file));
                        if (fileBaseName.toLowerCase() === videoIdForSubtitle.toLowerCase() && 
                            ['.mp4', '.webm', '.mkv', '.flv'].includes(path.extname(file).toLowerCase())) {
                            videoFile = path.join(searchDir, file);
                            break;
                        }
                    }
                    if (videoFile) break;
                } catch (e) {
                    // 忽略读取目录错误，继续查找下一个目录
                }
            }
            
            if (!videoFile) {
                throw new Error(`未找到视频文件，请确保视频文件存在于 ${workDir} 或其子目录中`);
            }
            
            console.log(`找到视频文件: ${videoFile}\n`);
            
            // 检查 ffmpeg
            console.log('检查 ffmpeg...');
            const ffmpegCheck = await checkFfmpeg();
            if (!ffmpegCheck.available) {
                throw new Error('ffmpeg 不可用，请先安装 ffmpeg: winget install ffmpeg');
            }
            console.log(`✓ 找到 ffmpeg: ${ffmpegCheck.version || '已安装'}\n`);
            
            // 确定输出文件路径（保存到以视频 ID 命名的子目录）
            let subtitleOutput = options.subtitleOutput;
            if (!subtitleOutput) {
            // 创建以视频 ID 命名的子目录（统一使用大写格式）
            const normalizedVideoId = videoIdForSubtitle.toUpperCase();
            const videoSubDir = path.join(workDir, normalizedVideoId);
            await ensureDirectoryExists(videoSubDir);
                
                const videoName = path.basename(videoFile, path.extname(videoFile));
                const ext = options.subtitleFormat === 'txt' ? '.txt' : options.subtitleFormat === 'vtt' ? '.vtt' : '.srt';
                subtitleOutput = path.join(videoSubDir, `${videoName}${ext}`);
            } else {
                // 如果用户指定了输出路径，确保目录存在
                const outputDir = path.dirname(subtitleOutput);
                if (!path.isAbsolute(outputDir)) {
                    // 相对路径，相对于工作目录
                    const videoSubDir = path.join(workDir, videoIdForSubtitle);
                    await ensureDirectoryExists(videoSubDir);
                    subtitleOutput = path.join(videoSubDir, path.basename(subtitleOutput));
                } else {
                    // 绝对路径，确保目录存在
                    await ensureDirectoryExists(outputDir);
                }
            }
            
            console.log('='.repeat(60));
            console.log('从视频文件提取字幕');
            console.log('='.repeat(60));
            console.log(`视频文件: ${videoFile}`);
            console.log(`输出文件: ${subtitleOutput}`);
            console.log(`输出格式: ${options.subtitleFormat}`);
            console.log('='.repeat(60));
            console.log();
            
            try {
                // 尝试从视频文件提取字幕
                const result = await extractSubtitleFromVideo(videoFile, subtitleOutput, options.subtitleFormat);
                console.log(`\n✓ 字幕已成功提取到: ${result}`);
            } catch (extractError) {
                // 如果视频文件没有内嵌字幕，尝试从原始 URL 获取
                console.log(`⚠ 从视频文件提取字幕失败: ${extractError.message}`);
                console.log('尝试从原始 URL 获取字幕...\n');
                
                const ytdlpCmd = getYtDlpCommand();
                const tempDir = path.join(os.tmpdir(), `bili-subs-${videoIdForSubtitle}-${Date.now()}`);
                
                try {
                    await fsPromises.mkdir(tempDir, { recursive: true });
                    
                    // 对于 Bilibili，默认包含 ai-zh（AI 生成的中文字幕）
                    const defaultSubLangs = options.subLangs || 'zh-Hans,zh-Hant,ai-zh';
                    
                    const args = [
                        jsonInfo.url,
                        '--write-subs',
                        '--write-auto-subs',
                        '--sub-langs', defaultSubLangs,
                        '--skip-download',
                        '--no-playlist',
                        '-o', path.join(tempDir, '%(id)s.%(ext)s')
                    ];
                    
                    if (!options.noCookies && options.cookiesFromBrowser) {
                        args.push('--cookies-from-browser', options.cookiesFromBrowser);
                    }
                    
                    console.log(`使用 yt-dlp 从原始 URL 获取字幕...`);
                    console.log(`命令: ${ytdlpCmd} ${args.join(' ')}\n`);
                    
                    await new Promise((resolve, reject) => {
                        const proc = spawn(ytdlpCmd, args, {
                            shell: false,
                            stdio: ['inherit', 'pipe', 'pipe']
                        });
                        
                        let stderr = '';
                        
                        proc.stderr.on('data', (data) => {
                            stderr += data.toString();
                        });
                        
                        proc.on('close', (code) => {
                            resolve();
                        });
                        
                        proc.on('error', (error) => {
                            reject(new Error(`启动 yt-dlp 失败: ${error.message}`));
                        });
                    });
                    
                    // 查找字幕文件
                    const files = await fsPromises.readdir(tempDir);
                    let subtitleFile = null;
                    
                    // 优先选择中文字幕（ai-zh, zh-Hans, zh-Hant）
                    const preferredLangs = ['ai-zh', 'zh-Hans', 'zh-Hant', 'zh'];
                    const subtitleFiles = [];
                    
                    for (const file of files) {
                        const ext = path.extname(file).toLowerCase();
                        if (['.vtt', '.srt', '.srv3', '.srv2', '.srv1', '.ttml'].includes(ext)) {
                            subtitleFiles.push(path.join(tempDir, file));
                        }
                    }
                    
                    if (subtitleFiles.length === 0) {
                        // 如果默认语言没有找到，尝试使用 all 获取所有字幕
                        console.log('默认语言未找到字幕，尝试获取所有可用字幕...\n');
                        
                        const allArgs = [
                            jsonInfo.url,
                            '--write-subs',
                            '--write-auto-subs',
                            '--sub-langs', 'all',
                            '--skip-download',
                            '--no-playlist',
                            '-o', path.join(tempDir, '%(id)s.%(ext)s')
                        ];
                        
                        if (!options.noCookies && options.cookiesFromBrowser) {
                            allArgs.push('--cookies-from-browser', options.cookiesFromBrowser);
                        }
                        
                        await new Promise((resolve) => {
                            const proc = spawn(ytdlpCmd, allArgs, {
                                shell: false,
                                stdio: ['inherit', 'pipe', 'pipe']
                            });
                            
                            proc.on('close', () => {
                                resolve();
                            });
                            
                            proc.on('error', () => {
                                resolve();
                            });
                        });
                        
                        // 重新读取文件列表
                        const newFiles = await fsPromises.readdir(tempDir);
                        for (const file of newFiles) {
                            const ext = path.extname(file).toLowerCase();
                            if (['.vtt', '.srt', '.srv3', '.srv2', '.srv1', '.ttml'].includes(ext)) {
                                subtitleFiles.push(path.join(tempDir, file));
                            }
                        }
                    }
                    
                    // 优先选择中文字幕
                    for (const lang of preferredLangs) {
                        for (const file of subtitleFiles) {
                            const fileName = path.basename(file);
                            if (fileName.includes(`.${lang}.`) || fileName.includes(`-${lang}.`)) {
                                subtitleFile = file;
                                break;
                            }
                        }
                        if (subtitleFile) break;
                    }
                    
                    // 如果还没找到，使用第一个
                    if (!subtitleFile && subtitleFiles.length > 0) {
                        subtitleFile = subtitleFiles[0];
                    }
                    
                    if (!subtitleFile) {
                        throw new Error('未找到字幕文件');
                    }
                    
                    // 读取并转换格式
                    let content = await fsPromises.readFile(subtitleFile, 'utf-8');
                    
                    if (options.subtitleFormat === 'txt') {
                        const ext = path.extname(subtitleFile).toLowerCase();
                        if (ext === '.srt') {
                            content = srtToText(content);
                        } else if (ext === '.vtt') {
                            content = cleanSubtitleContent(content, 'vtt');
                        }
                    }
                    
                    await fsPromises.writeFile(subtitleOutput, content, 'utf-8');
                    
                    // 清理临时目录
                    await fsPromises.rm(tempDir, { recursive: true, force: true });
                    
                    console.log(`\n✓ 字幕已成功获取并保存到: ${subtitleOutput}`);
                } catch (ytdlpError) {
                    // 清理临时目录
                    try {
                        await fsPromises.rm(tempDir, { recursive: true, force: true });
                    } catch (e) {
                        // 忽略清理错误
                    }
                    throw new Error(`所有方法都失败:\n  - 从视频提取: ${extractError.message}\n  - 从 URL 获取: ${ytdlpError.message}`);
                }
            }
            
        } catch (error) {
            console.error('\n✗ 提取字幕失败:');
            console.error(error.message);
            if (error.stack && process.env.DEBUG) {
                console.error('\n堆栈跟踪:');
                console.error(error.stack);
            }
            process.exit(1);
        }
        
        return; // 提取字幕后直接退出
    }

    // 提取视频 ID（如果还没有从 JSON 文件获取）
    if (!videoId) {
        videoId = extractVideoId(options.url);
        if (!videoId) {
            console.error('错误: 无法从 URL 中提取视频 ID');
            console.error('请确保 URL 格式正确，例如:');
            console.error('  https://www.bilibili.com/video/BV1234567890');
            console.error('  https://www.bilibili.com/video/av12345678');
            console.error('  https://b23.tv/xxxxx');
            process.exit(1);
        }
    }

    // 确定输出路径（保存到以视频 ID 命名的子目录）
    // 统一使用大写格式，确保目录名称一致
    const normalizedVideoId = videoId.toUpperCase();
    const workDir = path.join(process.cwd(), 'work_dir', 'scrape', 'bilibili');
    const videoSubDir = path.join(workDir, normalizedVideoId);
    
    // 确保子目录存在
    await ensureDirectoryExists(videoSubDir);
    
    let outputPath = options.output;
    if (!outputPath) {
        outputPath = path.join(videoSubDir, `${videoId}.json`);
    } else if (!path.isAbsolute(outputPath)) {
        // 相对路径，保存到子目录
        outputPath = path.join(videoSubDir, outputPath);
    }

    console.log('='.repeat(60));
    console.log('Bilibili 视频信息抓取工具');
    console.log('='.repeat(60));
    console.log(`URL: ${options.url}`);
    console.log(`视频 ID: ${videoId}`);
    if (!options.noSubtitles) {
        console.log(`字幕语言: ${options.subLangs}`);
    }
    if (options.download) {
        console.log(`下载视频: 是${options.audioOnly ? '（仅音频）' : ''}`);
    }
    if (!options.noCookies && options.cookiesFromBrowser) {
        console.log(`Cookies 来源: ${options.cookiesFromBrowser}`);
    }
    console.log(`输出文件: ${outputPath}`);
    console.log('='.repeat(60));

    // 检查 yt-dlp 是否可用
    console.log('\n检查 yt-dlp...');
    const ytdlpAvailable = await checkYtDlp();
    
    if (!ytdlpAvailable) {
        console.error('\n错误: 未找到 yt-dlp');
        console.log('\n请先安装 yt-dlp:');
        console.log('  .venv\\Scripts\\pip.exe install yt-dlp');
        console.log('\n或者全局安装:');
        console.log('  pip install yt-dlp');
        process.exit(1);
    }
    
    console.log(`✓ 找到 yt-dlp: ${getYtDlpCommand()}\n`);

    // 检查 ffmpeg（用于视频修复和合并，以及音频格式转换）
    let ffmpegAvailable = false;
    if (options.download) {
        console.log('检查 ffmpeg...');
        const ffmpegCheck = await checkFfmpeg();
        ffmpegAvailable = ffmpegCheck.available;
        if (ffmpegAvailable) {
            console.log(`✓ 找到 ffmpeg: ${ffmpegCheck.version || '已安装'}`);
            if (options.audioOnly) {
                console.log('  音频将自动转换格式（如需要）\n');
            } else {
                console.log('  视频将自动修复（如需要）\n');
            }
        } else {
            console.error('\n错误: 未找到 ffmpeg');
            console.log('\nffmpeg 用于视频格式转换和修复，以及音频格式转换，必须安装:');
            console.log('  winget install ffmpeg');
            console.log('\n安装后需要重启终端/IDE 才能生效。');
            if (options.audioOnly) {
                console.log('\n没有 ffmpeg 时，无法进行音频格式转换。');
            } else {
                console.log('\n没有 ffmpeg 时，下载的视频可能无法正常播放。');
            }
            process.exit(1);
        }
    }

    try {
        let extractedData = null;

        // 如果从 JSON 文件读取且只需要下载，使用 JSON 中的数据，跳过获取视频信息
        // 这样可以避免重复获取元数据，节省时间
        if (options.fromJson && options.download) {
            // 只下载视频，使用 JSON 文件中的数据
            extractedData = jsonData;
            console.log('使用 JSON 文件中的数据，跳过获取视频信息\n');
        } else {
            // 获取视频信息
            console.log('正在获取视频信息...\n');
            const videoInfo = await getVideoInfo(options.url, options);
            
            // 提取需要的字段
            extractedData = {
                id: videoInfo.id,
                title: videoInfo.title,
                description: videoInfo.description,
                channel: videoInfo.channel || videoInfo.uploader,
                channel_id: videoInfo.channel_id || videoInfo.uploader_id,
                channel_url: videoInfo.channel_url || videoInfo.uploader_url,
                upload_date: videoInfo.upload_date,
                duration: videoInfo.duration,
                duration_string: videoInfo.duration_string || formatDuration(videoInfo.duration),
                view_count: videoInfo.view_count,
                like_count: videoInfo.like_count,
                comment_count: videoInfo.comment_count,
                thumbnail: videoInfo.thumbnail,
                thumbnails: videoInfo.thumbnails,
                tags: videoInfo.tags || [],
                categories: videoInfo.categories || [],
                is_live: videoInfo.is_live,
                was_live: videoInfo.was_live,
                availability: videoInfo.availability,
                webpage_url: videoInfo.webpage_url,
                original_url: videoInfo.original_url
            };
            
            // 获取字幕
            if (!options.noSubtitles) {
                console.log('正在获取字幕...\n');
                const subtitles = await getSubtitles(options.url, videoId, options);
                if (Object.keys(subtitles).length > 0) {
                    extractedData.subtitles = subtitles;
                    console.log(`✓ 获取到 ${Object.keys(subtitles).length} 种语言的字幕: ${Object.keys(subtitles).join(', ')}\n`);
                } else {
                    console.log('⚠ 未找到字幕\n');
                    extractedData.subtitles = {};
                }
            }
        }
        
        // 下载视频（保存到子目录）
        if (options.download) {
            console.log('正在下载视频...');
            const videoOutputPath = path.join(videoSubDir, `${videoId}.%(ext)s`);
            try {
                const downloadedFile = await downloadVideo(options.url, videoOutputPath, { ...options, ffmpegAvailable });
                if (downloadedFile) {
                    extractedData.downloaded_file = downloadedFile;
                    console.log(`\n✓ 视频下载完成: ${downloadedFile}`);
                }
            } catch (downloadError) {
                console.error(`\n⚠ 视频下载失败: ${downloadError.message}`);
                extractedData.download_error = downloadError.message;
            }
        }
        
        // 如果从 JSON 文件读取且只下载，不保存 JSON 文件（避免覆盖原文件）
        if (!(options.fromJson && options.download)) {
            // 构建最终结果
            const result = {
                error: '0',
                data: extractedData
            };
            
            // 格式化输出
            const output = formatOutput(result, options.pretty);
            
            // 保存到文件
            await saveToFile(outputPath, output);
        }
        
        // 显示摘要信息
        console.log('\n✓ 操作成功！');
        if (extractedData.title) {
            console.log('\n内容摘要:');
            console.log(`  标题: ${extractedData.title}`);
            if (extractedData.channel) {
                console.log(`  频道: ${extractedData.channel}`);
            }
            if (extractedData.duration_string) {
                console.log(`  时长: ${extractedData.duration_string}`);
            }
            if (extractedData.view_count !== undefined) {
                console.log(`  观看次数: ${formatNumber(extractedData.view_count)}`);
            }
            if (extractedData.like_count !== undefined) {
                console.log(`  点赞数: ${formatNumber(extractedData.like_count)}`);
            }
            if (extractedData.comment_count) {
                console.log(`  评论数: ${formatNumber(extractedData.comment_count)}`);
            }
            if (extractedData.tags && extractedData.tags.length > 0) {
                console.log(`  标签: ${extractedData.tags.slice(0, 5).join(', ')}${extractedData.tags.length > 5 ? '...' : ''}`);
            }
            if (extractedData.subtitles && Object.keys(extractedData.subtitles).length > 0) {
                console.log(`  字幕语言: ${Object.keys(extractedData.subtitles).join(', ')}`);
            }
        }
        if (extractedData.downloaded_file) {
            console.log(`  已下载: ${extractedData.downloaded_file}`);
        }

    } catch (error) {
        console.error('\n✗ 抓取失败:');
        console.error(error.message);
        if (error.stack && process.env.DEBUG) {
            console.error('\n堆栈跟踪:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// 运行主函数（ESM 等价于 require.main === module：当作为入口直接执行时）
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    main().catch(error => {
        console.error('未处理的错误:', error);
        process.exit(1);
    });
}

export { main, parseArgs, extractVideoId, getVideoInfo, getSubtitles, checkYtDlp, getYtDlpCommand };


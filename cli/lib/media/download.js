/**
 * 媒体文件下载（HTTP + 可选 ffmpeg HLS）
 */

import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { classifyStream } from './twimg.js';
import { DEFAULT_REFERER } from './twimg.js';

let ffmpegAvailableCache = null;

export function detectFfmpeg() {
  if (ffmpegAvailableCache !== null) return Promise.resolve(ffmpegAvailableCache);
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => {
      ffmpegAvailableCache = false;
      resolve(false);
    });
    proc.on('close', (code) => {
      ffmpegAvailableCache = code === 0;
      resolve(ffmpegAvailableCache);
    });
  });
}

function photoExtension(url) {
  try {
    const fmt = new URL(url).searchParams.get('format');
    if (fmt === 'png') return '.png';
    if (fmt === 'webp') return '.webp';
    if (fmt === 'gif') return '.gif';
  } catch { /* ignore */ }
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return '.png';
  if (lower.includes('.webp')) return '.webp';
  if (lower.includes('.gif')) return '.gif';
  return '.jpg';
}

export function downloadFile(url, filePath, { referer = DEFAULT_REFERER } = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const stream = createWriteStream(filePath);
    const reqOpts = { headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0' } };

    const req = protocol.get(url, reqOpts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        stream.close();
        fs.unlink(filePath).catch(() => {});
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without location'));
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return downloadFile(next, filePath, { referer }).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        stream.close();
        fs.unlink(filePath).catch(() => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        resolve(filePath);
      });
      stream.on('error', (e) => {
        stream.close();
        fs.unlink(filePath).catch(() => {});
        reject(e);
      });
    });
    req.on('error', (e) => {
      stream.close();
      fs.unlink(filePath).catch(() => {});
      reject(e);
    });
  });
}

export function downloadHls(url, filePath, { referer = DEFAULT_REFERER, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-headers', `Referer: ${referer}\r\n`,
      '-i', url,
      '-c', 'copy',
      filePath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffmpeg timeout'));
    }, timeoutMs);

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && existsSync(filePath)) resolve(filePath);
      else reject(new Error(stderr.trim() || `ffmpeg exit ${code}`));
    });
  });
}

async function downloadOneItem(item, outDir, counters, opts) {
  const referer = opts.referer || DEFAULT_REFERER;
  const base = item.type === 'photo'
    ? `photo_${counters.photo += 1}`
    : `video_${counters.video += 1}`;

  const result = {
    type: item.type,
    url: item.url,
    streamType: item.streamType || classifyStream(item.url),
    localPath: null,
    ok: false,
    error: null,
  };

  try {
    if (item.type === 'photo') {
      const ext = photoExtension(item.url);
      const rel = `${base}${ext}`;
      const abs = path.join(outDir, rel);
      await downloadFile(item.url, abs, { referer });
      result.localPath = rel;
      result.ok = true;
      return result;
    }

    const streamType = result.streamType;
    if (streamType === 'hls') {
      const hasFfmpeg = await detectFfmpeg();
      if (!hasFfmpeg) {
        result.error = 'hls_requires_ffmpeg';
        return result;
      }
      const rel = `${base}.mp4`;
      const abs = path.join(outDir, rel);
      await downloadHls(item.url, abs, { referer, timeoutMs: opts.hlsTimeoutMs });
      result.localPath = rel;
      result.ok = true;
      return result;
    }

    const ext = item.url.includes('.webm') ? '.webm' : '.mp4';
    const rel = `${base}${ext}`;
    const abs = path.join(outDir, rel);
    await downloadFile(item.url, abs, { referer });
    result.localPath = rel;
    result.ok = true;
    return result;
  } catch (err) {
    result.error = err.message || String(err);
    return result;
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;

  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

/**
 * @param {Array<{type:string,url:string,streamType?:string}>} items
 * @param {string} outDir
 * @param {{ referer?: string, concurrency?: number, hlsTimeoutMs?: number, logger?: Function }} opts
 */
export async function downloadMedia(items, outDir, opts = {}) {
  const concurrency = opts.concurrency ?? 2;
  const logger = opts.logger || (() => {});
  if (!existsSync(outDir)) await fs.mkdir(outDir, { recursive: true });

  const counters = { photo: 0, video: 0 };
  const results = await runPool(items, (item) => downloadOneItem(item, outDir, counters, opts), concurrency);

  for (const r of results) {
    if (r.ok) logger(`媒体已下载: ${path.join(outDir, r.localPath)}`);
    else if (r.error) logger(`媒体下载失败 (${r.url}): ${r.error}`);
  }

  return results;
}

export function isMediaFileMissing(postDir, entry) {
  if (!entry?.ok || !entry.localPath) return true;
  return !existsSync(path.join(postDir, entry.localPath));
}

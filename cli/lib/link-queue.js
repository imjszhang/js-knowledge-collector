/**
 * Link queue — inbox/batch rotation and batch processing for link-collector.
 *
 * Logs go to stderr; stdout is reserved for NO_REPLY or the final Feishu summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { collect } from './collector.js';
import { openDatabase } from './db-config.js';
import { isLocalPath } from './file-path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MAX_RETRIES = 3;
const NO_REPLY = 'NO_REPLY';

const log = (msg) => process.stderr.write(`${msg}\n`);

function nowIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

function batchTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
}

export function resolveOpenClawConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH) return path.resolve(process.env.OPENCLAW_CONFIG_PATH);
  if (process.env.OPENCLAW_STATE_DIR) {
    return path.join(path.resolve(process.env.OPENCLAW_STATE_DIR), 'openclaw.json');
  }
  const home = process.env.OPENCLAW_HOME || os.homedir();
  return path.join(home, '.openclaw', 'openclaw.json');
}

export function resolveWorkspace(explicit) {
  if (explicit) return path.resolve(explicit);
  try {
    const cfgPath = resolveOpenClawConfigPath();
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const ws = cfg?.agents?.defaults?.workspace
        || cfg?.agents?.list?.[0]?.workspace;
      if (ws) return path.resolve(ws);
    }
  } catch (err) {
    log(`[link-queue] workspace resolve warning: ${err.message}`);
  }
  return process.cwd();
}

export function resolveQueueDir(workspace) {
  return path.join(resolveWorkspace(workspace), '.openclaw', 'link-collector');
}

function ensureQueueDir(queueDir) {
  fs.mkdirSync(queueDir, { recursive: true });
  fs.mkdirSync(path.join(queueDir, 'archive'), { recursive: true });
  const inbox = path.join(queueDir, 'inbox.jsonl');
  if (!fs.existsSync(inbox)) fs.writeFileSync(inbox, '', 'utf-8');
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return [];
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch (err) {
      log(`[link-queue] skip corrupt line in ${filePath}: ${err.message}`);
    }
  }
  return entries;
}

function writeJsonlAtomic(filePath, entries) {
  const tmp = `${filePath}.tmp`;
  const content = entries.length
    ? `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`
    : '';
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, entry) {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
}

function loadQueueConfig(queueDir) {
  const cfgPath = path.join(queueDir, 'config.json');
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return {};
  }
}

function normalizeTarget(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('url/path 不能为空');
  if (isLocalPath(value)) return path.resolve(value);
  return value;
}

function storeOptionsFrom(options) {
  if (!options) return {};
  if (typeof options === 'string') return { dbPath: options };
  return { dbPath: options.dbPath, remote: options.remote };
}

async function articleExistsByTarget(storeOptions, target) {
  const db = await openDatabase(storeOptionsFrom(storeOptions));
  try {
    return await db.findBySourceUrl(target);
  } finally {
    await db.close();
  }
}

function inboxHasTarget(entries, target) {
  return entries.some(
    (e) => e.url === target && (e.status === 'pending' || e.status === 'failed'),
  );
}

function newEntry({ target, priority = false, tags = [], autoTags = true, note = '', flomo = null, noSummary = false, force = false, forceSummary = false, downloadMedia = false }) {
  return {
    url: target,
    added_at: nowIso(),
    status: 'pending',
    retries: 0,
    tags,
    auto_tags: autoTags,
    note: note || '',
    priority: !!priority,
    flomo,
    noSummary: !!noSummary,
    force: !!force,
    forceSummary: !!forceSummary,
    downloadMedia: !!downloadMedia,
    last_error: null,
    processed_at: null,
  };
}

/**
 * Enqueue a URL or local file path.
 */
export async function enqueueLink(input, options = {}) {
  const {
    workspace,
    dbPath,
    remote,
    priority = false,
    tags = [],
    autoTags = true,
    note = '',
    flomo = null,
    noSummary = false,
    force = false,
    forceSummary = false,
    downloadMedia = false,
  } = options;

  const target = normalizeTarget(input);
  const queueDir = resolveQueueDir(workspace);
  ensureQueueDir(queueDir);
  const inboxPath = path.join(queueDir, 'inbox.jsonl');
  const inbox = readJsonl(inboxPath);

  if (inboxHasTarget(inbox, target)) {
    return { status: 'already_queued', target, queueDir };
  }

  const existing = await articleExistsByTarget({ dbPath, remote }, target);
  if (existing) {
    return {
      status: 'already_in_db',
      target,
      recordId: existing.id,
      title: existing.title,
      queueDir,
    };
  }

  const entry = newEntry({
    target,
    priority,
    tags,
    autoTags,
    note,
    flomo,
    noSummary,
    force,
    forceSummary,
    downloadMedia,
  });
  appendJsonl(inboxPath, entry);
  return { status: 'queued', target, priority: !!priority, queueDir };
}

function findActiveBatch(queueDir) {
  if (!fs.existsSync(queueDir)) return null;
  const files = fs.readdirSync(queueDir)
    .filter((f) => f.startsWith('batch-') && f.endsWith('.jsonl'))
    .map((f) => path.join(queueDir, f))
    .sort();
  return files[0] || null;
}

function inboxHasWork(inboxPath) {
  if (!fs.existsSync(inboxPath)) return false;
  const stat = fs.statSync(inboxPath);
  return stat.size > 0;
}

function rotateInboxToBatch(queueDir) {
  const inboxPath = path.join(queueDir, 'inbox.jsonl');
  const batchPath = path.join(queueDir, `batch-${batchTimestamp()}.jsonl`);
  fs.renameSync(inboxPath, batchPath);
  fs.writeFileSync(inboxPath, '', 'utf-8');
  return batchPath;
}

function sortBatchEntries(entries) {
  return [...entries].sort((a, b) => {
    const pa = a.priority ? 1 : 0;
    const pb = b.priority ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return 0;
  });
}

function resolveFlomo(entry, queueConfig, pluginDefaultFlomo) {
  if (entry.flomo === true) return true;
  if (entry.flomo === false) return false;
  if (queueConfig.defaultFlomo === true) return true;
  if (queueConfig.defaultFlomo === false) return false;
  return pluginDefaultFlomo ?? true;
}

function formatSummary(stats) {
  const { done, skipped, requeued, permanentlyFailed, doneTitles, skippedUrls, requeuedItems, failedItems } = stats;
  const total = done + skipped + requeued + permanentlyFailed;
  if (total === 0) return NO_REPLY;

  const lines = [
    `📦 链接入库完成（成功 ${done} | 跳过 ${skipped} | 回队列 ${requeued} | 永久失败 ${permanentlyFailed}）`,
    '',
  ];
  if (doneTitles.length) {
    lines.push('✅ 成功：');
    for (const t of doneTitles) lines.push(`  - ${t}`);
    lines.push('');
  }
  if (skippedUrls.length) {
    lines.push('⏭️ 跳过（已入库）：');
    for (const u of skippedUrls) lines.push(`  - ${u}`);
    lines.push('');
  }
  if (requeuedItems.length) {
    lines.push('🔄 回队列（下次重试）：');
    for (const item of requeuedItems) lines.push(`  - ${item.url}（${item.error}）`);
    lines.push('');
  }
  if (failedItems.length) {
    lines.push('❌ 永久失败：');
    for (const item of failedItems) lines.push(`  - ${item.url}（${item.error}）`);
  }
  return lines.join('\n').trim();
}

/**
 * Process inbox/batch queue. Writes summary or NO_REPLY to stdout.
 */
export async function processInbox(options = {}) {
  const {
    workspace,
    dbPath,
    remote,
    defaultFlomo = true,
    memorySyncEnabled = true,
    memorySyncDir = path.join(PROJECT_ROOT, 'work_dir', 'memory-export'),
    onCollected,
  } = options;

  const queueDir = resolveQueueDir(workspace);
  ensureQueueDir(queueDir);
  const queueConfig = loadQueueConfig(queueDir);

  let batchPath = findActiveBatch(queueDir);
  if (!batchPath) {
    const inboxPath = path.join(queueDir, 'inbox.jsonl');
    if (!inboxHasWork(inboxPath)) {
      process.stdout.write(`${NO_REPLY}\n`);
      return { silent: true, stats: null };
    }
    batchPath = rotateInboxToBatch(queueDir);
  }

  let entries = readJsonl(batchPath);
  entries = sortBatchEntries(entries);

  const stats = {
    done: 0,
    skipped: 0,
    requeued: 0,
    permanentlyFailed: 0,
    doneTitles: [],
    skippedUrls: [],
    requeuedItems: [],
    failedItems: [],
  };

  const inboxPath = path.join(queueDir, 'inbox.jsonl');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!['pending', 'failed'].includes(entry.status)) continue;

    entry.status = 'processing';
    writeJsonlAtomic(batchPath, entries);

    const target = entry.url;
    const existing = await articleExistsByTarget({ dbPath, remote }, target);
    if (existing) {
      entry.status = 'skipped';
      entry.processed_at = nowIso();
      stats.skipped += 1;
      stats.skippedUrls.push(target);
      writeJsonlAtomic(batchPath, entries);
      continue;
    }

    const flomo = resolveFlomo(entry, queueConfig, defaultFlomo);
    try {
      log(`[link-queue] collecting: ${target}`);
      const result = await collect(target, {
        dbPath,
        remote,
        flomo,
        noSummary: !!entry.noSummary,
        force: !!entry.force,
        forceSummary: !!entry.forceSummary,
        downloadMedia: !!entry.downloadMedia,
      });

      entry.status = 'done';
      entry.processed_at = nowIso();
      entry.last_error = null;
      stats.done += 1;
      stats.doneTitles.push(result.title || target);

      if (memorySyncEnabled && typeof onCollected === 'function') {
        await onCollected();
      }
    } catch (err) {
      const message = err.message || String(err);
      entry.last_error = message;
      entry.retries = (entry.retries || 0) + 1;
      if (entry.retries >= MAX_RETRIES) {
        entry.status = 'permanently_failed';
        entry.processed_at = nowIso();
        stats.permanentlyFailed += 1;
        stats.failedItems.push({ url: target, error: message });
      } else {
        entry.status = 'failed';
        appendJsonl(inboxPath, {
          ...entry,
          status: 'pending',
        });
        stats.requeued += 1;
        stats.requeuedItems.push({ url: target, error: message });
      }
      log(`[link-queue] failed (${entry.retries}/${MAX_RETRIES}): ${target} — ${message}`);
    }

    writeJsonlAtomic(batchPath, entries);
  }

  const archiveDir = path.join(queueDir, 'archive');
  const archivePath = path.join(archiveDir, path.basename(batchPath));
  fs.renameSync(batchPath, archivePath);
  log(`[link-queue] archived batch → ${archivePath}`);

  const summary = formatSummary(stats);
  process.stdout.write(`${summary}\n`);
  return { silent: summary === NO_REPLY, stats, summary };
}

export { NO_REPLY, PROJECT_ROOT };

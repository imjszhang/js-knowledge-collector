/**
 * Database source config — local SQLite or remote HTTP knowledge-collector.
 *
 * Remote is used only when enabled AND baseUrl is set. Otherwise callers
 * keep talking to the local SQLite file (dbPath / DB_PATH).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from './database.js';
import HttpRemoteDatabase from './http-database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(PROJECT_ROOT, 'data', 'data.db');
const DEFAULT_API_PREFIX = '/api/v1';

function envFlag(value) {
    if (value == null) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function asRemote(overrides = {}) {
    if (overrides.remote && typeof overrides.remote === 'object') {
        return overrides.remote;
    }
    return null;
}

export function defaultDbPath() {
    return process.env.DB_PATH || DEFAULT_DB_PATH;
}

/**
 * @param {object} [overrides]
 * @param {string} [overrides.dbPath]
 * @param {object} [overrides.remote]
 * @returns {{ mode: 'local'|'remote', dbPath: string, remote: object|null }}
 */
export function resolveDbConfig(overrides = {}) {
    const remote = asRemote(overrides);
    const dbPath = overrides.dbPath || defaultDbPath();

    const enabled = remote
        ? remote.enabled !== false
        : envFlag(process.env.REMOTE_DB_ENABLED);
    const baseUrl = (remote?.baseUrl || process.env.REMOTE_DB_BASE_URL || '').trim();
    const apiPrefix = (remote?.apiPrefix || process.env.REMOTE_DB_API_PREFIX || DEFAULT_API_PREFIX).trim()
        || DEFAULT_API_PREFIX;
    const token = remote?.token ?? process.env.REMOTE_DB_TOKEN ?? '';

    if (enabled && baseUrl) {
        return {
            mode: 'remote',
            dbPath,
            remote: {
                enabled: true,
                baseUrl: baseUrl.replace(/\/$/, ''),
                apiPrefix: apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`,
                token: String(token || ''),
                timeoutMs: remote?.timeoutMs,
                writeTimeoutMs: remote?.writeTimeoutMs,
                fetch: remote?.fetch,
            },
        };
    }

    return { mode: 'local', dbPath, remote: null };
}

/**
 * Open the configured store. Caller must close().
 * @param {object} [overrides]
 */
export async function openDatabase(overrides = {}) {
    const cfg = resolveDbConfig(overrides);
    if (cfg.mode === 'remote') {
        const db = new HttpRemoteDatabase(cfg.remote);
        await db.connect();
        return db;
    }
    const db = new Database(cfg.dbPath);
    await db.connect();
    return db;
}

export function isRemoteStore(overrides = {}) {
    return resolveDbConfig(overrides).mode === 'remote';
}

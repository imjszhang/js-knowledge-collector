/**
 * DataReader — 知识库数据查询封装
 *
 * 薄封装层，为 CLI 提供简洁的查询接口，底层调用 Database。
 */

import Database from './database.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(explicit) {
    return explicit || process.env.DB_PATH || path.resolve(__dirname, '../../data/data.db');
}

async function withDb(fn, dbPath) {
    const db = new Database(resolveDbPath(dbPath));
    try {
        await db.connect();
        return await fn(db);
    } finally {
        await db.close();
    }
}

export function searchArticles(keyword, options = {}) {
    const { dbPath, ...query } = options;
    return withDb(db => db.getArticles({ keyword, ...query }), dbPath);
}

export function listArticles(options = {}) {
    const { dbPath, ...query } = options;
    return withDb(db => db.getArticles(query), dbPath);
}

export function getArticle(id, options = {}) {
    const dbPath = typeof options === 'string' ? options : options.dbPath;
    return withDb(db => db.getRecord(id), dbPath);
}

export function deleteArticle(id, options = {}) {
    const dbPath = typeof options === 'string' ? options : options.dbPath;
    return withDb(db => db.deleteRecord(id), dbPath);
}

export function getStats(options = {}) {
    const dbPath = typeof options === 'string' ? options : options.dbPath;
    return withDb(db => db.getStats(), dbPath);
}

export function queryRecords(options = {}) {
    const { dbPath, ...query } = options;
    return withDb(db => db.getRecords(query), dbPath);
}

/**
 * DataReader — 知识库数据查询封装
 *
 * 薄封装层，为 CLI 提供简洁的查询接口，底层调用 Database。
 */

import Database from './database.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath() {
    return process.env.DB_PATH || path.resolve(__dirname, '../../data/data.db');
}

async function withDb(fn) {
    const db = new Database(resolveDbPath());
    try {
        await db.connect();
        return await fn(db);
    } finally {
        await db.close();
    }
}

export function searchArticles(keyword, options = {}) {
    return withDb(db => db.getArticles({ keyword, ...options }));
}

export function listArticles(options = {}) {
    return withDb(db => db.getArticles(options));
}

export function getArticle(id) {
    return withDb(db => db.getRecord(id));
}

export function deleteArticle(id) {
    return withDb(db => db.deleteRecord(id));
}

export function getStats() {
    return withDb(db => db.getStats());
}

export function queryRecords(options = {}) {
    return withDb(db => db.getRecords(options));
}

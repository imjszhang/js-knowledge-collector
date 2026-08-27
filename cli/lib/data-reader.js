/**
 * DataReader — 知识库数据查询封装
 *
 * 薄封装层，为 CLI 提供简洁的查询接口，底层调用 openDatabase。
 */

import { openDatabase } from './db-config.js';

function storeOptionsFrom(options) {
    if (!options) return {};
    if (typeof options === 'string') return { dbPath: options };
    return { dbPath: options.dbPath, remote: options.remote };
}

async function withDb(fn, storeOptions) {
    const db = await openDatabase(storeOptionsFrom(storeOptions));
    try {
        return await fn(db);
    } finally {
        await db.close();
    }
}

export function searchArticles(keyword, options = {}) {
    const { dbPath, remote, ...query } = options;
    return withDb((db) => db.getArticles({ keyword, ...query }), { dbPath, remote });
}

export function listArticles(options = {}) {
    const { dbPath, remote, ...query } = options;
    return withDb((db) => db.getArticles(query), { dbPath, remote });
}

export function getArticle(id, options = {}) {
    return withDb((db) => db.getRecord(id), options);
}

export function deleteArticle(id, options = {}) {
    return withDb((db) => db.deleteRecord(id), options);
}

export function getStats(options = {}) {
    return withDb((db) => db.getStats(), options);
}

export function queryRecords(options = {}) {
    const { dbPath, remote, ...query } = options;
    return withDb((db) => db.getRecords(query), { dbPath, remote });
}

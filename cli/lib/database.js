/**
 * Database — JS Knowledge Collector 数据库访问层
 *
 * 合并自 dsc-modules/js-knowledge/database.js（查询/筛选/分页）
 * 与 modules/jsKnowledgeDatabase.js（完整 CRUD + ID 生成 + 建表 + filter 解析）
 */

import sqlite3Pkg from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const sqlite3 = sqlite3Pkg.verbose();
const TABLE_NAME = 'jszhang_collected_articles';

const SOURCE_MAP = {
    wechat: 'mp.weixin.qq.com',
    xiaohongshu: 'xiaohongshu.com',
    zhihu_answer: 'zhihu.com/question',
    zhihu_zhuanlan: 'zhuanlan.zhihu.com',
    zhihu: 'zhihu.com',
    jike: 'okjike.com',
    x_com: 'x.com',
    reddit: 'reddit.com',
    bilibili: 'bilibili.com',
    youtube: 'youtube.com',
    github: 'github.com',
};

export default class Database {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    static generateId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        const bytes = crypto.randomBytes(15);
        for (let i = 0; i < 15; i++) {
            id += chars[bytes[i] % chars.length];
        }
        return id;
    }

    static now() {
        return new Date().toISOString();
    }

    // ── Connection ───────────────────────────────────────────────────

    connect() {
        return new Promise((resolve, reject) => {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            this.db = new sqlite3.Database(
                this.dbPath,
                sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                (err) => {
                    if (err) return reject(err);
                    this._init().then(resolve).catch(reject);
                },
            );
        });
    }

    async _init() {
        await this.run('PRAGMA cache_size = -20000');
        await this.run('PRAGMA temp_store = MEMORY');
        await this.run('PRAGMA busy_timeout = 5000');
        await this.run('PRAGMA journal_mode = WAL');

        await this.run(`
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                id TEXT PRIMARY KEY,
                title TEXT,
                summary TEXT,
                digest TEXT,
                content TEXT,
                cover_url TEXT,
                source_url TEXT,
                created TEXT,
                updated TEXT,
                recommend TEXT
            )
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_created ON ${TABLE_NAME}(created)`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_source_url ON ${TABLE_NAME}(source_url)`);
    }

    close() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve();
            this.db.close((err) => {
                if (err) return reject(err);
                this.db = null;
                resolve();
            });
        });
    }

    // ── Low-level helpers ────────────────────────────────────────────

    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
        });
    }

    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows)));
        });
    }

    // ── CRUD ─────────────────────────────────────────────────────────

    async addRecord(data) {
        const id = data.id || Database.generateId();
        const now = Database.now();
        const record = {
            id,
            title: data.title || '',
            summary: data.summary || '',
            digest: data.digest || '',
            content: data.content || '',
            cover_url: data.cover_url || '',
            source_url: data.source_url || '',
            created: data.created || now,
            updated: data.updated || now,
            recommend: data.recommend || '',
        };

        await this.run(
            `INSERT INTO ${TABLE_NAME}
             (id, title, summary, digest, content, cover_url, source_url, created, updated, recommend)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [record.id, record.title, record.summary, record.digest, record.content,
             record.cover_url, record.source_url, record.created, record.updated, record.recommend],
        );
        return { record_id: id, message: '记录添加成功' };
    }

    // NOTE: fields 参数直接拼接到 SQL，由内部调用者保证安全（未暴露给外部用户输入）
    async getRecord(recordId, fields = '') {
        const select = fields
            ? fields.split(',').map(f => f.trim()).filter(Boolean).join(', ')
            : '*';
        return (await this.get(`SELECT ${select} FROM ${TABLE_NAME} WHERE id = ?`, [recordId])) || null;
    }

    async updateRecord(recordId, data) {
        const existing = await this.getRecord(recordId);
        if (!existing) throw new Error(`记录不存在: ${recordId}`);

        const now = Database.now();
        const allowed = ['title', 'summary', 'digest', 'content', 'cover_url', 'source_url', 'recommend'];
        const sets = [];
        const params = [];
        for (const f of allowed) {
            if (data[f] !== undefined) {
                sets.push(`${f} = ?`);
                params.push(data[f]);
            }
        }
        sets.push('updated = ?');
        params.push(now);
        if (sets.length === 1) return { record_id: recordId, message: '没有需要更新的字段' };

        params.push(recordId);
        await this.run(`UPDATE ${TABLE_NAME} SET ${sets.join(', ')} WHERE id = ?`, params);
        return { record_id: recordId, message: '记录更新成功' };
    }

    async deleteRecord(recordId) {
        const result = await this.run(`DELETE FROM ${TABLE_NAME} WHERE id = ?`, [recordId]);
        if (result.changes === 0) throw new Error(`记录不存在: ${recordId}`);
        return { status: 'success', message: '记录删除成功' };
    }

    // ── Query (list / search / stats) ────────────────────────────────

    async getArticles(options = {}) {
        const page = options.page || 1;
        const perPage = options.perPage || 20;
        const source = options.source || '';
        const keyword = options.keyword || '';
        const sort = options.sort || '-created';

        const conditions = [];
        const params = [];

        if (source) {
            if (source === 'other') {
                const placeholders = Object.values(SOURCE_MAP).map(() => 'source_url NOT LIKE ?');
                conditions.push(`(${placeholders.join(' AND ')})`);
                Object.values(SOURCE_MAP).forEach(v => params.push(`%${v}%`));
            } else if (source === 'x_com') {
                conditions.push('(source_url LIKE ? OR source_url LIKE ?)');
                params.push('%x.com%', '%twitter.com%');
            } else if (SOURCE_MAP[source]) {
                conditions.push('source_url LIKE ?');
                params.push(`%${SOURCE_MAP[source]}%`);
            }
        }

        if (keyword) {
            conditions.push('(title LIKE ? OR summary LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        let order = 'ORDER BY created DESC';
        if (sort) {
            const desc = sort.startsWith('-');
            const field = desc ? sort.slice(1) : sort;
            if (['created', 'updated', 'title'].includes(field)) {
                order = `ORDER BY ${field} ${desc ? 'DESC' : 'ASC'}`;
            }
        }

        const offset = (page - 1) * perPage;
        const countResult = await this.get(`SELECT COUNT(*) as count FROM ${TABLE_NAME} ${where}`, params);
        const totalItems = countResult?.count ?? 0;
        const totalPages = Math.ceil(totalItems / perPage) || 1;

        const data = await this.all(
            `SELECT id, title, summary, digest, cover_url, source_url, created, recommend
             FROM ${TABLE_NAME} ${where} ${order} LIMIT ? OFFSET ?`,
            [...params, perPage, offset],
        );

        return { data, page, perPage, totalItems, totalPages };
    }

    async getStats() {
        const total = (await this.get(`SELECT COUNT(*) as c FROM ${TABLE_NAME}`))?.c ?? 0;
        const sources = await this.all(
            `SELECT source_url FROM ${TABLE_NAME}`,
        );

        const counts = {};
        for (const { source_url } of sources) {
            let matched = false;
            for (const [key, pattern] of Object.entries(SOURCE_MAP)) {
                if (source_url && source_url.includes(pattern)) {
                    counts[key] = (counts[key] || 0) + 1;
                    matched = true;
                    break;
                }
            }
            if (!matched) counts.other = (counts.other || 0) + 1;
        }

        const latest = await this.get(`SELECT created FROM ${TABLE_NAME} ORDER BY created DESC LIMIT 1`);
        return { total, sources: counts, latestArticle: latest?.created ?? null };
    }

    // ── PocketBase-compatible filter parser ──────────────────────────

    parseFilter(filter) {
        if (!filter?.trim()) return { whereClause: '', params: [] };

        const conditions = [];
        const params = [];
        let processed = filter;

        processed = processed.replace(/(\w+)\s*~\s*"([^"]*)"/g, (_, field, value) => {
            conditions.push(`${field} LIKE ?`);
            params.push(`%${value}%`);
            return `__COND_${conditions.length - 1}__`;
        });
        processed = processed.replace(/(\w+)\s*!=\s*""/g, (_, field) => {
            conditions.push(`(${field} IS NOT NULL AND ${field} != '')`);
            return `__COND_${conditions.length - 1}__`;
        });
        processed = processed.replace(/(\w+)\s*>=\s*"([^"]*)"/g, (_, field, value) => {
            conditions.push(`${field} >= ?`);
            params.push(value);
            return `__COND_${conditions.length - 1}__`;
        });
        processed = processed.replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, field, value) => {
            conditions.push(`${field} = ?`);
            params.push(value);
            return `__COND_${conditions.length - 1}__`;
        });

        if (!conditions.length) return { whereClause: '', params: [] };

        let clause = processed;
        for (let i = 0; i < conditions.length; i++) {
            clause = clause.replace(`__COND_${i}__`, conditions[i]);
        }
        clause = clause.replace(/\s*&&\s*/g, ' AND ').replace(/\s*\|\|\s*/g, ' OR ');
        return { whereClause: `WHERE ${clause}`, params };
    }

    async getRecords(options = {}) {
        const { filter = '', fields = '', sort = '-created', perPage = 500, page = 1, skiptotal = true } = options;
        const { whereClause, params } = this.parseFilter(filter);

        let order = 'ORDER BY created DESC';
        if (sort) {
            const desc = sort.startsWith('-');
            const field = desc ? sort.slice(1) : sort;
            if (['id', 'title', 'created', 'updated', 'source_url'].includes(field)) {
                order = `ORDER BY ${field} ${desc ? 'DESC' : 'ASC'}`;
            }
        }

        // NOTE: fields 参数直接拼接到 SQL，由内部调用者保证安全（未暴露给外部用户输入）
        const select = fields?.trim()
            ? fields.split(',').map(f => f.trim()).filter(Boolean).join(', ')
            : '*';
        const offset = (page - 1) * perPage;

        const data = await this.all(
            `SELECT ${select} FROM ${TABLE_NAME} ${whereClause} ${order} LIMIT ? OFFSET ?`,
            [...params, perPage, offset],
        );

        let totalItems = data.length;
        let totalPages = 1;
        if (!skiptotal) {
            const cnt = await this.get(`SELECT COUNT(*) as count FROM ${TABLE_NAME} ${whereClause}`, params);
            totalItems = cnt?.count ?? 0;
            totalPages = Math.ceil(totalItems / perPage) || 1;
        }

        return { status: 'success', count: data.length, data, totalItems, totalPages, page, perPage };
    }
}

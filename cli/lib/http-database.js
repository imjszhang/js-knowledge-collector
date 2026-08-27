/**
 * HttpRemoteDatabase — Database-compatible client for another knowledge-collector.
 *
 * Talks to GET/POST/DELETE /api/v1/* on the canonical LAN instance.
 * Does not fall back to a local SQLite file.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WRITE_TIMEOUT_MS = 30_000;

function unsupportedSql() {
    throw new Error('HttpRemoteDatabase 不支持裸 SQL，请使用业务方法');
}

export default class HttpRemoteDatabase {
    constructor(options = {}) {
        const baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
        if (!baseUrl) throw new Error('远程知识库缺少 baseUrl');

        let apiPrefix = options.apiPrefix || '/api/v1';
        if (!apiPrefix.startsWith('/')) apiPrefix = `/${apiPrefix}`;
        apiPrefix = apiPrefix.replace(/\/$/, '');

        this.baseUrl = baseUrl;
        this.apiPrefix = apiPrefix;
        this.token = options.token || '';
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.writeTimeoutMs = options.writeTimeoutMs || DEFAULT_WRITE_TIMEOUT_MS;
        this._fetch = options.fetch || globalThis.fetch.bind(globalThis);
        this.dbPath = `${baseUrl}${apiPrefix}`;
    }

    async connect() {
        try {
            await this._request('GET', '/health.json');
        } catch (err) {
            if (/404/.test(err.message)) return;
            throw err;
        }
    }

    async close() {
        return undefined;
    }

    run() { unsupportedSql(); }
    get() { unsupportedSql(); }
    all() { unsupportedSql(); }

    async findBySourceUrl(url) {
        if (!url) return null;
        const result = await this.getArticles({ sourceUrl: url, page: 1, perPage: 1 });
        const row = result.data?.[0];
        return row ? { id: row.id, title: row.title } : null;
    }

    async listAllArticles(options = {}) {
        const perPage = 100;
        const sort = options.sort || 'created';
        const wantsFull = !options.fields
            || String(options.fields).split(',').some((f) => ['content', 'updated'].includes(f.trim()));
        const all = [];
        let page = 1;
        let totalPages = 1;
        do {
            const result = await this.getArticles({
                page,
                perPage,
                sort,
                full: wantsFull,
            });
            all.push(...(result.data || []));
            totalPages = result.totalPages || 1;
            page += 1;
        } while (page <= totalPages);
        return all;
    }

    async addRecord(data) {
        const payload = await this._request('POST', '/articles.json', {
            body: data,
            timeoutMs: this.writeTimeoutMs,
            allowStatuses: [200, 201, 409],
        });
        if (payload.status === 'exists' || payload.existed) {
            return {
                record_id: payload.record_id,
                message: payload.message || '记录已存在',
                existed: true,
            };
        }
        if (!payload.record_id) {
            throw new Error(payload.message || '远程入库未返回 record_id');
        }
        return {
            record_id: payload.record_id,
            message: payload.message || '记录添加成功',
            existed: !!payload.existed,
        };
    }

    async getRecord(recordId) {
        const payload = await this._request('GET', `/articles/${encodeURIComponent(recordId)}.json`, {
            allowStatuses: [200, 404],
        });
        if (payload.status === 'error' || !payload.data) return null;
        return payload.data;
    }

    async deleteRecord(recordId) {
        return this._request('DELETE', `/articles/${encodeURIComponent(recordId)}.json`);
    }

    async getArticles(options = {}) {
        const query = {};
        if (options.page) query.page = String(options.page);
        if (options.perPage) query.perPage = String(options.perPage);
        if (options.source) query.source = options.source;
        if (options.keyword) query.keyword = options.keyword;
        if (options.sourceUrl) query.sourceUrl = options.sourceUrl;
        if (options.sort) query.sort = options.sort;
        if (options.full) query.full = '1';

        const payload = await this._request('GET', '/articles.json', { query });
        return {
            data: payload.data || [],
            page: payload.page || options.page || 1,
            perPage: payload.perPage || options.perPage || 20,
            totalItems: payload.totalItems ?? (payload.data || []).length,
            totalPages: payload.totalPages || 1,
        };
    }

    async getStats() {
        return this._request('GET', '/stats.json');
    }

    async getRecords() {
        throw new Error('HttpRemoteDatabase 不支持 getRecords / PocketBase filter');
    }

    // ── HTTP ─────────────────────────────────────────────────────────

    _buildUrl(pathname, query) {
        const url = new URL(`${this.baseUrl}${this.apiPrefix}${pathname}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value != null && value !== '') url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }

    async _request(method, pathname, options = {}) {
        const timeoutMs = options.timeoutMs || this.timeoutMs;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const headers = { Accept: 'application/json' };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';

        let response;
        try {
            response = await this._fetch(this._buildUrl(pathname, options.query), {
                method,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });
        } catch (err) {
            if (err?.name === 'AbortError') {
                throw new Error(`远程知识库超时 (${timeoutMs}ms): ${this.baseUrl}`);
            }
            throw new Error(`远程知识库连接失败: ${err.message}`);
        } finally {
            clearTimeout(timer);
        }

        const allowed = options.allowStatuses || [200];
        let payload = {};
        const text = await response.text();
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { message: text };
            }
        }

        if (response.status === 401 || response.status === 403) {
            throw new Error('远程知识库鉴权失败 (401)，请检查 remoteDbToken / REMOTE_DB_TOKEN');
        }

        if (!allowed.includes(response.status) && response.status !== 200) {
            const message = payload.message || payload.error || `HTTP ${response.status}`;
            throw new Error(`远程知识库错误 (${response.status}): ${message}`);
        }

        return payload;
    }
}

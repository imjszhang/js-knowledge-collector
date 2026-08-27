import test from 'node:test';
import assert from 'node:assert/strict';
import HttpRemoteDatabase from './http-database.js';

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function createDb(handler, extra = {}) {
    return new HttpRemoteDatabase({
        baseUrl: 'http://192.168.1.20:3000',
        apiPrefix: '/api/v1',
        token: 'secret',
        fetch: handler,
        ...extra,
    });
}

test('getArticles unwraps list payload and sends query', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const db = createDb(async (url, init) => {
        seenUrl = String(url);
        seenAuth = init.headers.Authorization;
        return jsonResponse(200, {
            status: 'success',
            data: [{ id: 'a1', title: 'T' }],
            page: 2,
            perPage: 12,
            totalItems: 13,
            totalPages: 2,
        });
    });
    const result = await db.getArticles({
        page: 2,
        perPage: 12,
        source: 'wechat',
        keyword: 'Agent',
        sourceUrl: 'https://mp.weixin.qq.com/s/x',
        full: true,
    });
    assert.equal(result.data[0].id, 'a1');
    assert.equal(result.totalItems, 13);
    assert.equal(seenAuth, 'Bearer secret');
    assert.match(seenUrl, /page=2/);
    assert.match(seenUrl, /source=wechat/);
    assert.match(seenUrl, /sourceUrl=/);
    assert.match(seenUrl, /full=1/);
});

test('getRecord returns article data', async () => {
    const db = createDb(async () => jsonResponse(200, {
        status: 'success',
        data: { id: 'abc', title: 'Hello' },
    }));
    const row = await db.getRecord('abc');
    assert.equal(row.title, 'Hello');
});

test('addRecord posts body and returns record_id', async () => {
    let method = '';
    let body = null;
    const db = createDb(async (_url, init) => {
        method = init.method;
        body = JSON.parse(init.body);
        return jsonResponse(200, { status: 'success', record_id: 'new1' });
    });
    const result = await db.addRecord({ title: 'X', source_url: 'https://ex.com/1' });
    assert.equal(method, 'POST');
    assert.equal(body.title, 'X');
    assert.equal(result.record_id, 'new1');
    assert.equal(result.existed, false);
});

test('addRecord treats 409 as already exists', async () => {
    const db = createDb(async () => jsonResponse(409, {
        status: 'exists',
        record_id: 'old1',
        message: '记录已存在',
    }));
    const result = await db.addRecord({ source_url: 'https://ex.com/1' });
    assert.equal(result.record_id, 'old1');
    assert.equal(result.existed, true);
});

test('401 becomes a clear auth error', async () => {
    const db = createDb(async () => jsonResponse(401, { message: 'nope' }));
    await assert.rejects(() => db.getStats(), /鉴权失败/);
});

test('timeout becomes a clear timeout error', async () => {
    const db = createDb(async (_url, init) => {
        await new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
    }, { timeoutMs: 20 });
    await assert.rejects(() => db.getStats(), /超时/);
});

test('run/get/all throw unsupported', async () => {
    const db = createDb(async () => jsonResponse(200, {}));
    assert.throws(() => db.run('SELECT 1'), /不支持裸 SQL/);
    assert.throws(() => db.get('SELECT 1'), /不支持裸 SQL/);
    assert.throws(() => db.all('SELECT 1'), /不支持裸 SQL/);
});

test('findBySourceUrl uses sourceUrl query', async () => {
    const db = createDb(async (url) => {
        assert.match(String(url), /sourceUrl=https/);
        return jsonResponse(200, {
            status: 'success',
            data: [{ id: 'z1', title: 'Z' }],
            totalItems: 1,
            totalPages: 1,
        });
    });
    const row = await db.findBySourceUrl('https://example.com/z');
    assert.equal(row.id, 'z1');
});

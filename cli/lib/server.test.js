import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from './database.js';
import { startServer } from './server.js';

test('serve health, sourceUrl, and token-protected POST', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-srv-'));
    const dbPath = path.join(dir, 'data.db');
    const seed = new Database(dbPath);
    await seed.connect();
    await seed.close();

    const server = await startServer({ port: 18765, dbPath, apiToken: 'tok' });
    const addr = server.address();
    const base = `http://127.0.0.1:${addr.port}/api/v1`;

    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const health = await (await fetch(`${base}/health.json`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.mode, 'local');

    const denied = await fetch(`${base}/articles.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'A', source_url: 'https://example.com/a' }),
    });
    assert.equal(denied.status, 401);

    const created = await fetch(`${base}/articles.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok',
        },
        body: JSON.stringify({ title: 'A', source_url: 'https://example.com/a', summary: 's' }),
    });
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    assert.ok(createdBody.record_id);

    const again = await fetch(`${base}/articles.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok',
        },
        body: JSON.stringify({ title: 'A2', source_url: 'https://example.com/a' }),
    });
    assert.equal(again.status, 409);
    const againBody = await again.json();
    assert.equal(againBody.record_id, createdBody.record_id);

    const listed = await (await fetch(`${base}/articles.json?sourceUrl=${encodeURIComponent('https://example.com/a')}`)).json();
    assert.equal(listed.totalItems, 1);
    assert.equal(listed.data[0].title, 'A');
});

test('startServer throws when local db is missing (does not exit process)', async () => {
    const missing = path.join(os.tmpdir(), `kc-missing-${Date.now()}`, 'no.db');
    await assert.rejects(
        () => startServer({ port: 18766, dbPath: missing, apiToken: 'tok' }),
        /数据库不存在/,
    );
});

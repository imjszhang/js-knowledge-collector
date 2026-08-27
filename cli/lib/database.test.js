import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from './database.js';

async function withTempDb(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-db-'));
    const dbPath = path.join(dir, 'data.db');
    const db = new Database(dbPath);
    await db.connect();
    try {
        await fn(db);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('findBySourceUrl returns null when missing', async () => {
    await withTempDb(async (db) => {
        assert.equal(await db.findBySourceUrl('https://example.com/a'), null);
    });
});

test('addRecord then findBySourceUrl', async () => {
    await withTempDb(async (db) => {
        const added = await db.addRecord({
            title: 'Hello',
            source_url: 'https://example.com/a',
            summary: 's',
        });
        assert.ok(added.record_id);
        assert.equal(added.existed, undefined);

        const found = await db.findBySourceUrl('https://example.com/a');
        assert.equal(found.id, added.record_id);
        assert.equal(found.title, 'Hello');
    });
});

test('addRecord dedups by source_url', async () => {
    await withTempDb(async (db) => {
        const first = await db.addRecord({
            title: 'One',
            source_url: 'https://example.com/dup',
        });
        const second = await db.addRecord({
            title: 'Two',
            source_url: 'https://example.com/dup',
        });
        assert.equal(second.record_id, first.record_id);
        assert.equal(second.existed, true);

        const listed = await db.listAllArticles({ fields: 'id,title,source_url' });
        assert.equal(listed.length, 1);
        assert.equal(listed[0].title, 'One');
    });
});

test('getArticles sourceUrl exact match', async () => {
    await withTempDb(async (db) => {
        await db.addRecord({ title: 'A', source_url: 'https://example.com/a' });
        await db.addRecord({ title: 'B', source_url: 'https://example.com/b' });
        const result = await db.getArticles({ sourceUrl: 'https://example.com/b' });
        assert.equal(result.totalItems, 1);
        assert.equal(result.data[0].title, 'B');
    });
});

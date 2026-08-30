import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDbConfig, isRemoteStore } from './db-config.js';
import { resolveLlmProxyUrl, resolveRemoteDbProxyUrl } from './http-proxy-fetch.js';
import Database from './database.js';
import HttpRemoteDatabase from './http-database.js';
import { openDatabase } from './db-config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('resolveDbConfig defaults to local sqlite', () => {
    const prev = process.env.REMOTE_DB_ENABLED;
    const prevUrl = process.env.REMOTE_DB_BASE_URL;
    delete process.env.REMOTE_DB_ENABLED;
    delete process.env.REMOTE_DB_BASE_URL;
    const cfg = resolveDbConfig({ dbPath: '/tmp/local.db' });
    assert.equal(cfg.mode, 'local');
    assert.equal(cfg.dbPath, '/tmp/local.db');
    assert.equal(cfg.remote, null);
    assert.equal(isRemoteStore({ dbPath: '/tmp/local.db' }), false);
    if (prev != null) process.env.REMOTE_DB_ENABLED = prev;
    if (prevUrl != null) process.env.REMOTE_DB_BASE_URL = prevUrl;
});

test('resolveDbConfig uses remote when enabled and baseUrl set', () => {
    const cfg = resolveDbConfig({
        dbPath: '/tmp/local.db',
        remote: {
            enabled: true,
            baseUrl: 'http://192.168.1.20:3000/',
            apiPrefix: 'api/v1',
            token: 'secret',
        },
    });
    assert.equal(cfg.mode, 'remote');
    assert.equal(cfg.remote.baseUrl, 'http://192.168.1.20:3000');
    assert.equal(cfg.remote.apiPrefix, '/api/v1');
    assert.equal(cfg.remote.token, 'secret');
    assert.equal(cfg.remote.proxy, '');
});

test('remote DB proxy is independent from LLM proxy', () => {
    const env = {
        LLM_HTTP_PROXY: 'socks5://127.0.0.1:1080',
        REMOTE_DB_HTTP_PROXY: 'socks5://127.0.0.1:1081',
    };
    assert.equal(resolveLlmProxyUrl(env), 'socks5://127.0.0.1:1080');
    assert.equal(resolveRemoteDbProxyUrl(env), 'socks5://127.0.0.1:1081');
    assert.equal(resolveRemoteDbProxyUrl({ LLM_HTTP_PROXY: 'socks5://127.0.0.1:1080' }), '');

    const cfg = resolveDbConfig({
        remote: {
            enabled: true,
            baseUrl: 'http://10.8.0.5:8888/knowledge',
            proxy: 'socks5://127.0.0.1:1081',
        },
    });
    assert.equal(cfg.remote.proxy, 'socks5://127.0.0.1:1081');
});

test('resolveDbConfig stays local when enabled without baseUrl', () => {
    const cfg = resolveDbConfig({
        remote: { enabled: true, baseUrl: '' },
    });
    assert.equal(cfg.mode, 'local');
});

test('openDatabase returns Sqlite when local', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cfg-'));
    const dbPath = path.join(dir, 'data.db');
    const db = await openDatabase({ dbPath });
    try {
        assert.ok(db instanceof Database);
        assert.equal(db instanceof HttpRemoteDatabase, false);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('openDatabase returns HttpRemoteDatabase when remote', async () => {
    const db = await openDatabase({
        remote: {
            enabled: true,
            baseUrl: 'http://192.168.1.20:3000',
            fetch: async () => new Response(JSON.stringify({ status: 'ok', mode: 'local', total: 0 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        },
    });
    try {
        assert.ok(db instanceof HttpRemoteDatabase);
    } finally {
        await db.close();
    }
});

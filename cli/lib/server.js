/**
 * Server — 轻量 HTTP 服务器，提供静态文件服务 + REST API
 *
 * API 路由:
 *   GET    /api/v1/articles.json?page=&perPage=&source=&keyword=&sourceUrl=&full=
 *   POST   /api/v1/articles.json
 *   GET    /api/v1/articles/:id.json
 *   DELETE /api/v1/articles/:id.json
 *   GET    /api/v1/stats.json
 *   GET    /api/v1/health.json
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, resolveDbConfig, defaultDbPath } from './db-config.js';
import { requireApiToken, resolveApiToken, readJsonBody } from './api-auth.js';
import {
    listArticlesPayload,
    createArticlePayload,
    articleDetailPayload,
    deleteArticlePayload,
    statsPayload,
    healthPayload,
} from './article-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.md': 'text/markdown; charset=utf-8',
};

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS,
    });
    res.end(payload);
}

function serveStatic(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });
    res.writeHead(200, { 'Content-Type': mime });
    stream.pipe(res);
}

async function handleApi(ctx, req, res, pathname, searchParams) {
    if (pathname === '/api/v1/health.json' && req.method === 'GET') {
        const result = await healthPayload(ctx.db, ctx.mode);
        json(res, result.statusCode, result.body);
        return;
    }

    if (pathname === '/api/v1/articles.json' && req.method === 'GET') {
        const result = await listArticlesPayload(ctx.db, searchParams);
        json(res, result.statusCode, result.body);
        return;
    }

    if (pathname === '/api/v1/articles.json' && req.method === 'POST') {
        const auth = requireApiToken(req, ctx.apiToken);
        if (!auth.ok) {
            json(res, auth.status, { status: 'error', message: auth.message });
            return;
        }
        const data = await readJsonBody(req);
        const result = await createArticlePayload(ctx.db, data);
        json(res, result.statusCode, result.body);
        return;
    }

    if (pathname === '/api/v1/stats.json' && req.method === 'GET') {
        const result = await statsPayload(ctx.db);
        json(res, result.statusCode, result.body);
        return;
    }

    const articleMatch = pathname.match(/^\/api\/v1\/articles\/([^/]+)\.json$/);
    if (articleMatch) {
        const id = articleMatch[1];
        if (req.method === 'GET') {
            const result = await articleDetailPayload(ctx.db, id);
            json(res, result.statusCode, result.body);
            return;
        }
        if (req.method === 'DELETE') {
            const result = await deleteArticlePayload(ctx.db, id);
            json(res, result.statusCode, result.body);
            return;
        }
    }

    json(res, 404, { status: 'error', message: 'API route not found' });
}

async function handleRequest(ctx, req, res) {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(parsed.pathname);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }

    if (pathname.startsWith('/api/v1/')) {
        try {
            await handleApi(ctx, req, res, pathname, parsed.searchParams);
        } catch (err) {
            process.stderr.write(`API error: ${err.message}\n`);
            json(res, 500, { status: 'error', message: err.message });
        }
        return;
    }

    let filePath = path.join(SRC_DIR, pathname === '/' ? 'index.html' : pathname);
    filePath = path.normalize(filePath);

    if (!filePath.startsWith(SRC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
    }

    serveStatic(res, filePath);
}

export async function startServer(options = {}) {
    const port = parseInt(options.port, 10) || 3000;
    const log = (msg) => process.stderr.write(msg + '\n');
    const storeOptions = {
        dbPath: options.dbPath || defaultDbPath(),
        remote: options.remote,
    };
    const cfg = resolveDbConfig(storeOptions);

    if (cfg.mode === 'local' && !fs.existsSync(cfg.dbPath)) {
        log(`Error: 数据库不存在 (${cfg.dbPath})`);
        log('请先运行 collect 命令收集文章，或设置 DB_PATH / remoteDb 环境变量');
        process.exit(1);
    }

    const db = await openDatabase(storeOptions);
    const ctx = {
        db,
        mode: cfg.mode,
        apiToken: resolveApiToken(options.apiToken),
    };

    if (cfg.mode === 'remote') {
        log(`Database connected: remote ${cfg.remote.baseUrl}${cfg.remote.apiPrefix}`);
    } else {
        log(`Database connected: ${cfg.dbPath}`);
    }

    const server = http.createServer((req, res) => {
        handleRequest(ctx, req, res);
    });

    await new Promise((resolve, reject) => {
        server.on('listening', resolve);
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                log(`Error: 端口 ${port} 已被占用，尝试端口 ${port + 1}`);
                server.listen(port + 1);
            } else {
                reject(err);
            }
        });
        server.listen(port);
    });

    const addr = server.address();
    log(`\n  Server running at http://localhost:${addr.port}`);
    log(`  Serving static files from: ${SRC_DIR}`);
    log(`  API base: http://localhost:${addr.port}/api/v1/\n`);

    const shutdown = async () => {
        log('\nShutting down...');
        server.close();
        await db.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
}

/**
 * Server — 轻量 HTTP 服务器，提供静态文件服务 + REST API
 *
 * API 路由:
 *   GET    /api/v1/articles.json?page=&perPage=&source=&keyword=
 *   GET    /api/v1/articles/:id.json
 *   DELETE /api/v1/articles/:id.json
 *   GET    /api/v1/stats.json
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from './database.js';

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

function resolveDbPath() {
    return process.env.DB_PATH || path.join(ROOT, 'data', 'data.db');
}

function json(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

// ── API Route Handlers ──────────────────────────────────────────────

async function handleArticlesList(db, query, res) {
    const page = parseInt(query.get('page'), 10) || 1;
    const perPage = parseInt(query.get('perPage'), 10) || 12;
    const source = query.get('source') || '';
    const keyword = query.get('keyword') || '';

    const result = await db.getArticles({ page, perPage, source, keyword });
    json(res, 200, { status: 'success', ...result });
}

async function handleArticleDetail(db, id, res) {
    const record = await db.getRecord(id);
    if (!record) {
        json(res, 404, { status: 'error', message: '文章不存在' });
        return;
    }
    json(res, 200, { status: 'success', data: record });
}

async function handleArticleDelete(db, id, res) {
    try {
        const result = await db.deleteRecord(id);
        json(res, 200, result);
    } catch (err) {
        json(res, 404, { status: 'error', message: err.message });
    }
}

async function handleStats(db, res) {
    const stats = await db.getStats();
    json(res, 200, stats);
}

// ── Router ──────────────────────────────────────────────────────────

async function handleRequest(db, req, res) {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(parsed.pathname);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    // API routes
    if (pathname.startsWith('/api/v1/')) {
        try {
            if (pathname === '/api/v1/articles.json' && req.method === 'GET') {
                await handleArticlesList(db, parsed.searchParams, res);
                return;
            }

            if (pathname === '/api/v1/stats.json' && req.method === 'GET') {
                await handleStats(db, res);
                return;
            }

            const articleMatch = pathname.match(/^\/api\/v1\/articles\/([^/]+)\.json$/);
            if (articleMatch) {
                const id = articleMatch[1];
                if (req.method === 'GET') {
                    await handleArticleDetail(db, id, res);
                    return;
                }
                if (req.method === 'DELETE') {
                    await handleArticleDelete(db, id, res);
                    return;
                }
            }

            json(res, 404, { status: 'error', message: 'API route not found' });
        } catch (err) {
            process.stderr.write(`API error: ${err.message}\n`);
            json(res, 500, { status: 'error', message: err.message });
        }
        return;
    }

    // Static file serving
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

// ── Start ───────────────────────────────────────────────────────────

export async function startServer(options = {}) {
    const port = parseInt(options.port, 10) || 3000;
    const dbPath = resolveDbPath();
    const log = (msg) => process.stderr.write(msg + '\n');

    if (!fs.existsSync(dbPath)) {
        log(`Error: 数据库不存在 (${dbPath})`);
        log('请先运行 collect 命令收集文章，或设置 DB_PATH 环境变量');
        process.exit(1);
    }

    const db = new Database(dbPath);
    await db.connect();
    log(`Database connected: ${dbPath}`);

    const server = http.createServer((req, res) => {
        handleRequest(db, req, res);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            log(`Error: 端口 ${port} 已被占用，尝试端口 ${port + 1}`);
            server.listen(port + 1);
        } else {
            log(`Server error: ${err.message}`);
            process.exit(1);
        }
    });

    server.listen(port, () => {
        const addr = server.address();
        log(`\n  Server running at http://localhost:${addr.port}`);
        log(`  Serving static files from: ${SRC_DIR}`);
        log(`  API base: http://localhost:${addr.port}/api/v1/\n`);
    });

    const shutdown = async () => {
        log('\nShutting down...');
        server.close();
        await db.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

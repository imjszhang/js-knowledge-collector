/**
 * Build — 将 src/ 构建到 docs/，并生成 api/v1/ 静态 JSON 数据
 *
 * Usage: node build/build.js [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from '../cli/lib/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DOCS = path.join(ROOT, 'docs');

function resolveDbPath() {
    return process.env.DB_PATH || path.join(ROOT, 'data', 'data.db');
}

function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

export async function build(options = {}) {
    const { dryRun = false } = options;
    const log = (msg) => process.stderr.write(msg + '\n');
    const results = { staticFiles: 0, apiFiles: 0 };

    // 1. 复制 src/ → docs/
    log('Step 1: 复制 src/ → docs/ ...');
    if (!dryRun) {
        copyDirSync(SRC, DOCS);
        const nojekyll = path.join(DOCS, '.nojekyll');
        if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, '', 'utf-8');
    }
    results.staticFiles = fs.readdirSync(SRC).length;
    log(`  复制了 ${results.staticFiles} 个文件/目录`);

    // 2. 生成 api/v1/ JSON 数据
    log('Step 2: 生成 api/v1/ 静态数据 ...');
    const apiDir = path.join(DOCS, 'api', 'v1');
    const articlesDir = path.join(apiDir, 'articles');

    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) {
        log(`  数据库不存在 (${dbPath})，跳过 API 生成`);
        return results;
    }

    const db = new Database(dbPath);
    await db.connect();

    try {
        if (!dryRun) {
            if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
            if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir, { recursive: true });
        }

        // articles.json — 文章列表（不含 content 字段，减小体积）
        const allArticles = await db.all(
            'SELECT id, title, summary, digest, cover_url, source_url, created, recommend FROM jszhang_collected_articles ORDER BY created DESC',
        );

        if (!dryRun) {
            fs.writeFileSync(path.join(apiDir, 'articles.json'), JSON.stringify({ status: 'success', data: allArticles, totalItems: allArticles.length, page: 1, totalPages: 1 }, null, 2), 'utf-8');
        }
        results.apiFiles++;
        log(`  articles.json: ${allArticles.length} 篇`);

        // 每篇文章的详情 JSON
        const fullArticles = await db.all('SELECT * FROM jszhang_collected_articles ORDER BY created DESC');
        for (const article of fullArticles) {
            if (!dryRun) {
                fs.writeFileSync(path.join(articlesDir, `${article.id}.json`), JSON.stringify(article, null, 2), 'utf-8');
            }
            results.apiFiles++;
        }
        log(`  articles/*.json: ${fullArticles.length} 个详情文件`);

        // stats.json
        const stats = await db.getStats();
        if (!dryRun) {
            fs.writeFileSync(path.join(apiDir, 'stats.json'), JSON.stringify(stats, null, 2), 'utf-8');
        }
        results.apiFiles++;
        log(`  stats.json: total=${stats.total}`);
    } finally {
        await db.close();
    }

    log(`构建完成: ${results.staticFiles} 静态文件, ${results.apiFiles} API 文件`);
    return results;
}

// 直接运行时执行构建
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const dryRun = process.argv.includes('--dry-run');
    build({ dryRun }).catch(err => {
        process.stderr.write(`Build failed: ${err.message}\n`);
        process.exit(1);
    });
}

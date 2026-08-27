/**
 * Shared Bearer-token helpers for standalone serve and OpenClaw plugin routes.
 */

import crypto from 'node:crypto';

function headerValue(req, name) {
    if (!req?.headers) return '';
    const direct = req.headers[name] || req.headers[name.toLowerCase()];
    if (Array.isArray(direct)) return direct[0] || '';
    return direct || '';
}

export function getBearerToken(req) {
    const header = String(headerValue(req, 'authorization') || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

/**
 * POST 写入必须带 token。未配置 token 时拒绝，避免局域网裸写。
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
export function requireApiToken(req, expectedToken) {
    if (!expectedToken) {
        return {
            ok: false,
            status: 401,
            message: '正库未配置 API_TOKEN / apiToken，拒绝写入',
        };
    }
    const got = getBearerToken(req);
    if (!got || !safeEqual(got, expectedToken)) {
        return {
            ok: false,
            status: 401,
            message: '未授权：需要有效的 Bearer token',
        };
    }
    return { ok: true };
}

export function resolveApiToken(explicit) {
    if (explicit) return String(explicit);
    return process.env.API_TOKEN || '';
}

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export function readJsonBody(req) {
    if (req.body != null) {
        if (typeof req.body === 'string') {
            return Promise.resolve(req.body.trim() ? JSON.parse(req.body) : {});
        }
        return Promise.resolve(req.body);
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('请求体过大'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (!raw.trim()) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

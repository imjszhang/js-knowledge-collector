/**
 * Optional proxied fetch for LLM / remote-DB (SOCKS5 / HTTP).
 * Scraping stays on globalThis.fetch.
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { socksDispatcher } from 'fetch-socks';

export function resolveLlmProxyUrl(env = process.env) {
    return (env.LLM_HTTP_PROXY || '').trim();
}

export function resolveRemoteDbProxyUrl(env = process.env) {
    return (env.REMOTE_DB_HTTP_PROXY || '').trim();
}

function createDispatcher(proxyUrl) {
    const parsed = new URL(proxyUrl);
    const scheme = parsed.protocol.replace(':', '');

    if (scheme === 'socks5' || scheme === 'socks5h') {
        return socksDispatcher({
            type: 5,
            host: parsed.hostname,
            port: Number(parsed.port) || 1080,
            ...(parsed.username ? { userId: decodeURIComponent(parsed.username) } : {}),
            ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        });
    }

    if (scheme === 'http' || scheme === 'https') {
        return new ProxyAgent(proxyUrl);
    }

    throw new Error(`不支持的代理协议 "${scheme}"，请使用 socks5://、socks5h://、http:// 或 https://`);
}

/**
 * @param {string | undefined | null} proxyUrl
 * @returns {typeof fetch | undefined}
 */
export function createProxiedFetch(proxyUrl) {
    const normalized = String(proxyUrl || '').trim();
    if (!normalized) return undefined;
    const dispatcher = createDispatcher(normalized);
    return (input, init = {}) => undiciFetch(input, { ...init, dispatcher });
}

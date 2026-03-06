/**
 * Flomo — 发送内容到 Flomo API
 *
 * 精简自 agent-js/scripts/sendToFlomo.js，使用 Node 内置 fetch。
 */

import fs from 'node:fs/promises';

/**
 * 发送文本到 Flomo
 * @param {string} content 要发送的内容
 * @returns {Promise<Object>} API 响应
 */
export async function sendToFlomo(content) {
    const apiUrl = process.env.FLOMO_API_URL;
    if (!apiUrl) throw new Error('FLOMO_API_URL 环境变量未设置');
    if (!content?.trim()) throw new Error('内容不能为空');

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) throw new Error(`Flomo API 请求失败: ${response.status} - ${JSON.stringify(data)}`);
    return { success: true, status: response.status, data };
}

/**
 * 发送文件内容到 Flomo
 * @param {string} filePath 文件路径
 * @param {Object} [options]
 * @param {string} [options.prepend] 前置文本
 * @param {string} [options.append]  后置文本
 * @returns {Promise<Object>}
 */
export async function sendFileToFlomo(filePath, options = {}) {
    let content = await fs.readFile(filePath, 'utf-8');
    if (options.prepend) content = options.prepend + content;
    if (options.append) content = content + options.append;
    return sendToFlomo(content);
}

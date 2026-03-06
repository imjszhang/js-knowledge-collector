/**
 * 浏览器自动化模块 (v4.0.0 - JS-Eyes 适配层)
 *
 * 底层通信委托给 JS-Eyes Client，本模块仅保留上层业务编排逻辑：
 * - scrapePage: 完整抓取流程（开标签 → 等待 → 钩子 → 取HTML → 关标签）
 * - openOrReuseTab: 标签页复用
 * - waitForTabReady: 等待页面加载完成（轮询 document.readyState）
 * - waitForContentReady: 等待页面内容渲染就绪
 * - getCookiesByDomain: 按域名获取 cookies（通过 getTabs + getCookies 组合实现）
 *
 * 变更历史：
 * - v4.0.0：底层替换为 JS-Eyes Client，移除自研 WebSocket 通信、Challenge-Response 认证、
 *           HTTP 长轮询、事件订阅系统、Cookie DB 操作
 */

import { JsEyesClient } from './js-eyes-client.js';

class BrowserAutomation {
  /**
   * @param {string} [serverUrl] WebSocket 服务器地址，如 "ws://localhost:18080"。
   *   如果未提供，从环境变量 JS_EYES_WS_URL 获取，最终回退到 ws://localhost:18080
   * @param {Object} [options]
   * @param {number} [options.requestInterval] 请求最小间隔（ms）
   * @param {number} [options.defaultTimeout] 默认请求超时（秒）
   * @param {Object} [options.logger] 日志对象
   */
  constructor(serverUrl, options = {}) {
    const wsUrl = serverUrl || process.env.JS_EYES_WS_URL || 'ws://localhost:18080';
    this.logger = options.logger || console;

    this._client = new JsEyesClient(wsUrl, {
      requestInterval: options.requestInterval,
      defaultTimeout: options.defaultTimeout,
      logger: this.logger,
    });
  }

  // ============================================
  // 连接管理（代理到 JS-Eyes Client）
  // ============================================

  async connect() { return this._client.connect(); }
  disconnect() { return this._client.disconnect(); }
  async ensureConnected() { return this._client.ensureConnected(); }

  // ============================================
  // 底层操作（代理到 JS-Eyes Client）
  // ============================================

  /**
   * 获取所有标签页，返回与旧接口兼容的格式
   * @returns {Promise<Object>} { status: 'success', tabs: Array, browsers: Array, activeTabId }
   */
  async getTabs() {
    const data = await this._client.getTabs();
    return {
      status: 'success',
      tabs: data.tabs || [],
      browsers: data.browsers || [],
      activeTabId: data.activeTabId,
    };
  }

  /**
   * @returns {Promise<number>} 标签页 ID
   */
  async openUrl(url, tabId = null, windowId = null, options = {}) {
    return this._client.openUrl(url, tabId, windowId, options);
  }

  async closeTab(tabId, options = {}) {
    return this._client.closeTab(tabId, options);
  }

  /**
   * @returns {Promise<string>} HTML 内容
   */
  async getTabHtml(tabId, options = {}) {
    return this._client.getTabHtml(tabId, options);
  }

  /**
   * @returns {Promise<any>} 执行结果
   */
  async executeScript(tabId, code, options = {}) {
    return this._client.executeScript(tabId, code, options);
  }

  async injectCss(tabId, css, options = {}) {
    return this._client.injectCss(tabId, css, options);
  }

  /**
   * @returns {Promise<Array>} cookies 数组
   */
  async getCookies(tabId, options = {}) {
    return this._client.getCookies(tabId, options);
  }

  /**
   * @returns {Promise<Array>} 客户端列表
   */
  async listClients(options = {}) {
    return this._client.listClients(options);
  }

  // ============================================
  // Cookie 操作
  // ============================================

  /**
   * 按域名获取 cookies（通过遍历标签页 + getCookies 组合实现）
   *
   * JS-Eyes 服务端不支持 get_cookies_by_domain 操作，
   * 此方法找到匹配域名的标签页，获取其 cookies 后去重合并。
   *
   * @param {string} domain 域名，如 "xiaohongshu.com"
   * @param {Object} [options]
   * @param {boolean} [options.includeSubdomains=true] 是否包含子域名
   * @returns {Promise<Object>} { status, cookies }
   */
  async getCookiesByDomain(domain, options = {}) {
    const { includeSubdomains = true } = options;

    try {
      const tabsResult = await this.getTabs();
      const tabs = tabsResult.tabs || [];

      const matchingTabs = tabs.filter(tab => {
        try {
          const tabHost = new URL(tab.url).hostname;
          if (includeSubdomains) {
            return tabHost === domain || tabHost.endsWith('.' + domain);
          }
          return tabHost === domain;
        } catch {
          return false;
        }
      });

      if (!matchingTabs.length) {
        this.logger.warn(`未找到匹配域名 ${domain} 的标签页，尝试获取第一个标签页的 cookies`);
        if (tabs.length) {
          const cookies = await this.getCookies(tabs[0].id);
          const filtered = cookies.filter(c => {
            const d = (c.domain || '').replace(/^\./, '');
            return includeSubdomains
              ? (d === domain || d.endsWith('.' + domain))
              : d === domain;
          });
          return { status: 'success', cookies: filtered };
        }
        return { status: 'success', cookies: [] };
      }

      const allCookies = [];
      const seen = new Set();

      for (const tab of matchingTabs) {
        try {
          const cookies = await this.getCookies(tab.id);
          for (const c of cookies) {
            const key = `${c.domain}|${c.name}|${c.path || '/'}`;
            if (!seen.has(key)) {
              seen.add(key);
              allCookies.push(c);
            }
          }
        } catch (err) {
          this.logger.warn(`获取标签页 ${tab.id} cookies 失败: ${err.message}`);
        }
      }

      this.logger.info(`按域名获取 ${allCookies.length} 个 cookies (${domain})`);
      return { status: 'success', cookies: allCookies };
    } catch (error) {
      this.logger.error(`按域名获取 cookies 失败: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // 等待方法
  // ============================================

  /**
   * 等待标签页加载完成（轮询 document.readyState）
   *
   * @param {number} tabId 标签页 ID
   * @param {Object} [options]
   * @param {number} [options.timeout=30000] 超时时间（毫秒）
   * @returns {Promise<Object>} { id, status, url, title }
   */
  async waitForTabReady(tabId, options = {}) {
    const { timeout = 30000 } = options;
    const startTime = Date.now();
    let interval = 500;
    const maxInterval = 3000;

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.executeScript(tabId, `({
          readyState: document.readyState,
          url: location.href,
          title: document.title
        })`);

        if (result && result.readyState === 'complete') {
          this.logger.info(`标签页 ${tabId} 已加载完成`);
          return {
            id: tabId,
            status: 'complete',
            url: result.url,
            title: result.title,
          };
        }
      } catch {
        // 页面可能正在导航中，脚本执行失败是正常的
      }

      await new Promise(r => setTimeout(r, interval));
      interval = Math.min(interval * 1.5, maxInterval);
    }

    throw new Error(`等待标签页 ${tabId} 加载超时 (${timeout}ms)`);
  }

  /**
   * 等待页面内容就绪
   *
   * @param {number} tabId 标签页 ID
   * @param {Object} [options]
   * @param {string}  [options.selector]  内容选择器（如 '#js_content'）
   * @param {number}  [options.minContentLength=50] 最小内容长度
   * @param {number}  [options.timeout=15000] 超时时间（毫秒）
   * @param {number}  [options.checkInterval=1500] 初始检查间隔（毫秒）
   * @param {number}  [options.maxCheckInterval=4000] 最大检查间隔（毫秒）
   * @param {number}  [options.maxChecks=8] 最大检查次数
   * @returns {Promise<Object>} { ready, contentLength, checkCount }
   */
  async waitForContentReady(tabId, options = {}) {
    const {
      selector = null,
      minContentLength = 50,
      timeout = 15000,
      checkInterval = 1500,
      maxCheckInterval = 4000,
      maxChecks = 8,
    } = options;

    const startTime = Date.now();
    let currentInterval = checkInterval;
    let checkCount = 0;

    const checkScript = selector
      ? `(() => {
          const el = document.querySelector('${selector}');
          return {
            found: !!el,
            length: el ? el.textContent.length : 0,
            text: el ? el.textContent.substring(0, 100) : ''
          };
        })()`
      : `(() => {
          const body = document.body;
          return {
            found: !!body,
            length: body ? body.textContent.length : 0,
            text: body ? body.textContent.substring(0, 100) : ''
          };
        })()`;

    this.logger.info(`等待内容就绪: tabId=${tabId}, selector=${selector || 'body'}, minLength=${minContentLength}, maxChecks=${maxChecks}`);

    while (Date.now() - startTime < timeout && checkCount < maxChecks) {
      try {
        checkCount++;
        const result = await this.executeScript(tabId, checkScript);

        if (result && result.found && result.length >= minContentLength) {
          this.logger.info(`内容已就绪: length=${result.length}, 检查次数=${checkCount}`);
          return { ready: true, contentLength: result.length, checkCount };
        }

        this.logger.debug?.(`内容检测中(${checkCount}/${maxChecks}): found=${result?.found}, length=${result?.length}`);
      } catch (error) {
        this.logger.warn(`内容检测出错(${checkCount}/${maxChecks}): ${error.message}`);
      }

      await new Promise(r => setTimeout(r, currentInterval));
      currentInterval = Math.min(currentInterval * 1.5, maxCheckInterval);
    }

    const reason = checkCount >= maxChecks ? `达到最大检查次数(${maxChecks})` : `超时(${timeout}ms)`;
    this.logger.warn(`等待内容结束: ${reason}, 检查次数=${checkCount}`);
    return { ready: false, contentLength: 0, checkCount };
  }

  // ============================================
  // 高级抓取方法
  // ============================================

  /**
   * 打开或复用标签页
   *
   * @param {string} url 目标 URL
   * @param {Object} [options]
   * @param {boolean} [options.exactMatch=true] 是否精确匹配 URL
   * @param {boolean} [options.requireComplete=true] 是否要求标签页已加载完成
   * @returns {Promise<Object>} { tabId, isReused, url }
   */
  async openOrReuseTab(url, options = {}) {
    const { exactMatch = true, requireComplete = true } = options;

    try {
      const tabsResult = await this.getTabs();

      if (tabsResult.status === 'success' && tabsResult.tabs) {
        const matchingTab = tabsResult.tabs.find(tab => {
          const urlMatch = exactMatch
            ? tab.url === url
            : tab.url.startsWith(url.split('?')[0]);
          const statusMatch = requireComplete ? tab.status === 'complete' : true;
          return urlMatch && statusMatch;
        });

        if (matchingTab) {
          this.logger.info(`复用已有标签页 ${matchingTab.id}: ${matchingTab.url}`);
          return { tabId: matchingTab.id, isReused: true, url: matchingTab.url };
        }
      }

      this.logger.info(`创建新标签页: ${url}`);
      const tabId = await this.openUrl(url);
      return { tabId, isReused: false, url };
    } catch (error) {
      this.logger.error(`openOrReuseTab 失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 完整的页面抓取流程
   *
   * @param {string} url 目标 URL
   * @param {Object} [options]
   * @param {boolean}  [options.reuseTab=true]     是否复用已有标签页
   * @param {boolean}  [options.closeAfter=true]   完成后是否关闭标签页
   * @param {number}   [options.loadTimeout=30000] 页面加载超时（毫秒）
   * @param {Object}   [options.contentWait]       内容等待配置（传递给 waitForContentReady）
   * @param {Function} [options.beforeGetHtml]     获取 HTML 前的钩子 async (tabId, url) => void
   * @param {Function} [options.afterGetHtml]      获取 HTML 后的钩子 async (tabId, html) => Object
   * @returns {Promise<Object>} { tabId, html, isReused, extraData }
   */
  async scrapePage(url, options = {}) {
    const {
      reuseTab = true,
      closeAfter = true,
      loadTimeout = 30000,
      contentWait = null,
      beforeGetHtml = null,
      afterGetHtml = null,
    } = options;

    let tabId = null;
    let isReused = false;

    try {
      // 1. 打开或复用标签页
      if (reuseTab) {
        const tabResult = await this.openOrReuseTab(url, { requireComplete: false });
        tabId = tabResult.tabId;
        isReused = tabResult.isReused;
      } else {
        tabId = await this.openUrl(url);
        isReused = false;
      }

      this.logger.info(`使用标签页 ${tabId} (复用: ${isReused})`);

      // 2. 等待页面加载完成
      if (!isReused) {
        this.logger.info('等待页面加载完成...');
        try {
          await this.waitForTabReady(tabId, { timeout: loadTimeout });
          this.logger.info('页面加载完成');
        } catch (error) {
          this.logger.warn(`等待页面加载失败，继续执行: ${error.message}`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // 3. 等待内容就绪（可选）
      if (contentWait) {
        await this.waitForContentReady(tabId, contentWait);
      }

      // 4. 前置钩子
      if (beforeGetHtml && typeof beforeGetHtml === 'function') {
        this.logger.info('执行前置钩子...');
        await beforeGetHtml(tabId, url);
      }

      // 5. 获取 HTML
      this.logger.info('获取页面 HTML 内容...');
      const html = await this.getTabHtml(tabId);
      this.logger.info(`获取 HTML 成功: ${html.length} 字符`);

      // 6. 后置钩子
      let extraData = {};
      if (afterGetHtml && typeof afterGetHtml === 'function') {
        this.logger.info('执行后置钩子...');
        extraData = await afterGetHtml(tabId, html) || {};
      }

      // 7. 关闭标签页（可选）
      if (closeAfter) {
        this.logger.info('关闭标签页...');
        await this.closeTab(tabId);
        this.logger.info('标签页已关闭');
      }

      return { tabId, html, isReused, extraData };
    } catch (error) {
      this.logger.error(`scrapePage 失败: ${error.message}`);

      if (tabId && closeAfter) {
        try { await this.closeTab(tabId); } catch {}
      }

      throw error;
    }
  }
}

export default BrowserAutomation;

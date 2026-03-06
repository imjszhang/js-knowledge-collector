/**
 * 浏览器抓取扩展基类
 * 
 * 为不同网站提供统一的抓取扩展接口。
 * 子类可以重写 prepare() 和 extractExtra() 方法实现网站专用逻辑。
 */
class BaseScrapeExtension {
  /**
   * @param {BrowserAutomation} browser BrowserAutomation 实例
   */
  constructor(browser) {
    this.browser = browser;
    this.logger = browser?.logger || console;
  }

  /**
   * 获取扩展名称
   * @returns {string}
   */
  get name() {
    return 'base';
  }

  /**
   * 获取内容等待配置
   * 子类可重写此方法返回网站专用的等待配置
   * @param {string} url 目标URL
   * @returns {Object|null} waitForContentReady 的配置参数
   */
  getContentWaitConfig(url) {
    return null;
  }

  /**
   * 准备阶段钩子（获取HTML前执行）
   * 
   * 用于执行网站专用的准备逻辑，如：
   * - 滚动加载更多内容
   * - 触发懒加载
   * - 点击展开按钮
   * - 等待特定元素出现
   * 
   * @param {number} tabId 标签页ID
   * @param {string} url 目标URL
   * @returns {Promise<void>}
   */
  async prepare(tabId, url) {
    // 默认实现：不做任何操作
    this.logger.debug?.(`[${this.name}] prepare: 使用默认实现`);
  }

  /**
   * 提取额外数据钩子（获取HTML后执行）
   * 
   * 用于提取无法从HTML中获取的数据，如：
   * - 通过API获取的视频URL
   * - 动态加载的评论
   * - 需要执行脚本才能获取的数据
   * 
   * @param {number} tabId 标签页ID
   * @param {string} html 页面HTML内容
   * @param {string} url 目标URL
   * @returns {Promise<Object>} 额外数据对象，将合并到最终结果
   */
  async extractExtra(tabId, html, url) {
    // 默认实现：返回空对象
    this.logger.debug?.(`[${this.name}] extractExtra: 使用默认实现`);
    return {};
  }

  /**
   * 执行页面脚本的辅助方法
   * @param {number} tabId 标签页ID
   * @param {string} script JavaScript代码
   * @returns {Promise<any>}
   */
  async executeScript(tabId, script) {
    return await this.browser.executeScript(tabId, script);
  }

  /**
   * 等待指定时间
   * @param {number} ms 毫秒数
   * @returns {Promise<void>}
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 滚动页面的辅助方法
   * @param {number} tabId 标签页ID
   * @param {Object} options 配置选项
   * @param {number} options.steps 滚动步数（默认5）
   * @param {number} options.delay 每步延迟（毫秒，默认300）
   * @param {boolean} options.scrollBack 是否滚回顶部（默认true）
   * @returns {Promise<void>}
   */
  async scrollPage(tabId, options = {}) {
    const { steps = 5, delay = 300, scrollBack = true } = options;
    
    const scrollScript = `
      (async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        const viewportHeight = window.innerHeight;
        
        for (let i = 0; i < ${steps}; i++) {
          window.scrollBy(0, viewportHeight);
          await delay(${delay});
        }
        
        ${scrollBack ? 'window.scrollTo(0, 0); await delay(300);' : ''}
        return true;
      })();
    `;
    
    await this.executeScript(tabId, scrollScript);
  }

  /**
   * 检测页面中是否存在视频元素
   * @param {number} tabId 标签页ID
   * @param {string} containerSelector 可选的容器选择器
   * @returns {Promise<number>} 视频元素数量
   */
  async detectVideoElements(tabId, containerSelector = null) {
    const script = containerSelector
      ? `(() => {
          const container = document.querySelector('${containerSelector}');
          return container ? container.querySelectorAll('video').length : 0;
        })()`
      : `document.querySelectorAll('video').length`;
    
    return await this.executeScript(tabId, script);
  }
}

export default BaseScrapeExtension;

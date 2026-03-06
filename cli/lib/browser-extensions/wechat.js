/**
 * 微信公众号专用抓取扩展
 * 
 * 处理微信公众号的特殊需求：
 * - 等待正文内容加载
 * - 触发图片懒加载
 * - 提取文章图片列表
 */

import BaseScrapeExtension from './common.js';

class WechatScrapeExtension extends BaseScrapeExtension {
  constructor(browser) {
    super(browser);
  }

  get name() {
    return 'wechat';
  }

  /**
   * 获取内容等待配置
   * 微信公众号的正文容器是 #js_content 或 .rich_media_content
   * 优化：缩短超时和检查间隔，加快整体抓取速度
   */
  getContentWaitConfig(url) {
    return {
      selector: '#js_content, .rich_media_content',
      minContentLength: 80,
      timeout: 10000,
      checkInterval: 1000,
      maxCheckInterval: 3000,
      maxChecks: 6
    };
  }

  /**
   * 准备阶段：触发图片懒加载并等待加载完成（单次API调用）
   * 优化：减少滚动步数、缩短等待时间，目标在 60 秒内完成抓取
   */
  async prepare(tabId, url) {
    this.logger.info('[wechat] 执行页面准备（懒加载+等待图片，合并为单次API调用）...');
    
    try {
      // 将滚动懒加载 + data-src转换 + 等待图片加载合并为一次 executeScript 调用
      // 优化：滚动步数 15→6，每步 200→120ms，图片等待 5s→2.5s，阈值 80%→50%
      const prepareScript = `
        (async () => {
          const delay = ms => new Promise(r => setTimeout(r, ms));
          
          // 阶段1: 滚动页面触发懒加载（减少步数加快速度）
          const viewportHeight = window.innerHeight;
          const scrollHeight = document.documentElement.scrollHeight;
          const steps = Math.ceil(scrollHeight / viewportHeight);
          
          for (let i = 0; i < Math.min(steps, 6); i++) {
            window.scrollBy(0, viewportHeight * 0.8);
            await delay(120);
          }
          
          // 滚回顶部
          window.scrollTo(0, 0);
          await delay(150);
          
          // 阶段2: 将 data-src 转换为 src（微信懒加载机制）
          document.querySelectorAll('img[data-src]').forEach(img => {
            if (!img.src || img.src.includes('data:image')) {
              img.src = img.getAttribute('data-src');
            }
          });
          
          // 阶段3: 等待图片加载（缩短最大等待，降低完成阈值）
          const maxWait = 2500;
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWait) {
            const images = document.querySelectorAll('#js_content img, .rich_media_content img');
            let loadedCount = 0;
            
            images.forEach(img => {
              if (img.complete || img.naturalHeight > 0) {
                loadedCount++;
              }
            });
            
            if (images.length > 0 && loadedCount >= Math.max(1, images.length * 0.5)) {
              return { phase: 'complete', loaded: loadedCount, total: images.length };
            }
            
            await delay(200);
          }
          
          // 超时后返回当前状态
          const images = document.querySelectorAll('#js_content img, .rich_media_content img');
          let loadedCount = 0;
          images.forEach(img => {
            if (img.complete || img.naturalHeight > 0) loadedCount++;
          });
          
          return { phase: 'timeout', loaded: loadedCount, total: images.length };
        })();
      `;
      
      const result = await this.executeScript(tabId, prepareScript);
      
      if (result) {
        this.logger.info(`[wechat] ✓ 页面准备完成(${result.phase}): 图片 ${result.loaded}/${result.total}`);
      }
    } catch (error) {
      this.logger.warn(`[wechat] 页面准备失败: ${error.message}`);
    }
  }

  /**
   * 提取额外数据：图片列表
   */
  async extractExtra(tabId, html, url) {
    try {
      const imageUrls = await this._extractImageUrls(tabId);
      
      if (imageUrls.length > 0) {
        this.logger.info(`[wechat] ✓ 提取到 ${imageUrls.length} 张图片`);
        return { image_urls: imageUrls };
      }
    } catch (error) {
      this.logger.warn(`[wechat] 提取图片失败: ${error.message}`);
    }
    
    return {};
  }

  /**
   * 提取文章图片 URL
   * @private
   */
  async _extractImageUrls(tabId) {
    try {
      const extractScript = `
        (() => {
          const urls = new Set();
          const contentContainer = document.querySelector('#js_content, .rich_media_content');
          
          if (!contentContainer) return [];
          
          // 提取所有图片
          contentContainer.querySelectorAll('img').forEach(img => {
            // 优先使用 data-src（原始高清图）
            let src = img.getAttribute('data-src') || img.src;
            
            if (src && !src.startsWith('data:') && !src.includes('svg')) {
              // 移除微信图片 URL 中的尺寸限制参数，获取原图
              src = src.replace(/\\?.*$/, ''); // 移除查询参数
              src = src.replace(/\\/\\d+$/, ''); // 移除尾部尺寸
              
              // 过滤掉小图标和表情
              if (!src.includes('res.wx.qq.com') && 
                  !src.includes('emoji') && 
                  !src.includes('icon')) {
                urls.add(src);
              }
            }
          });
          
          return [...urls];
        })();
      `;
      
      const urls = await this.executeScript(tabId, extractScript);
      return urls || [];
    } catch (error) {
      this.logger.warn(`[wechat] 提取图片URL失败: ${error.message}`);
      return [];
    }
  }
}

export default WechatScrapeExtension;

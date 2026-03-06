/**
 * 浏览器抓取扩展模块
 * 
 * 为不同网站提供专用的抓取逻辑扩展。
 * 每个扩展继承自 BaseScrapeExtension，实现网站专用的 prepare() 和 extractExtra() 方法。
 */

import BaseScrapeExtension from './common.js';

// 延迟加载扩展模块，避免循环依赖
import XComScrapeExtension from './xcom.js';
import WechatScrapeExtension from './wechat.js';
const extensionModules = {
  x_com: () => XComScrapeExtension,
  wechat: () => WechatScrapeExtension,
  wechat_old: () => WechatScrapeExtension,
  // 可以继续添加其他网站扩展
  // xiaohongshu: () => require('./xiaohongshu'),
  // zhihu_answer: () => require('./zhihu'),
  // zhihu_zhuanlan: () => require('./zhihu'),
};

// 缓存已加载的扩展类
const loadedExtensions = {};

/**
 * 获取指定规则名称的扩展类
 * @param {string} ruleName 规则名称（如 'x_com', 'wechat'）
 * @returns {Function|null} 扩展类构造函数，或 null（如果没有专用扩展）
 */
function getExtensionClass(ruleName) {
  if (!ruleName || !extensionModules[ruleName]) {
    return null;
  }
  
  // 缓存已加载的扩展
  if (!loadedExtensions[ruleName]) {
    try {
      loadedExtensions[ruleName] = extensionModules[ruleName]();
    } catch (error) {
      console.error(`加载扩展 ${ruleName} 失败:`, error.message);
      return null;
    }
  }
  
  return loadedExtensions[ruleName];
}

/**
 * 创建指定规则名称的扩展实例
 * @param {string} ruleName 规则名称
 * @param {BrowserAutomation} browser BrowserAutomation 实例
 * @returns {BaseScrapeExtension|null} 扩展实例，或 null
 */
function createExtension(ruleName, browser) {
  const ExtensionClass = getExtensionClass(ruleName);
  
  if (!ExtensionClass) {
    return null;
  }
  
  return new ExtensionClass(browser);
}

/**
 * 检查指定规则是否有专用扩展
 * @param {string} ruleName 规则名称
 * @returns {boolean}
 */
function hasExtension(ruleName) {
  return !!extensionModules[ruleName];
}

/**
 * 获取所有支持的扩展名称
 * @returns {string[]}
 */
function getSupportedExtensions() {
  return Object.keys(extensionModules);
}

export {
  BaseScrapeExtension,
  getExtensionClass,
  createExtension,
  hasExtension,
  getSupportedExtensions
};

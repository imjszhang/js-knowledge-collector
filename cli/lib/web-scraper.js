/**
 * WebScraper - 通用网页内容抓取工具
 * 
 * > 创建时间: 2024-01-01
 * > 最后更新: 2025-12-21
 * > 当前版本: 1.5.0
 * 
 * 功能简介：
 * ==========
 * WebScraper 是一个支持多种网站的内容抓取类，能够自动识别网站类型并使用相应的提取策略。
 * 支持从网页URL、HTML内容或本地文件提取结构化数据。
 * 
 * 支持的网站：
 * -----------
 * - 小红书 (xiaohongshu.com) - 支持笔记内容、用户信息、评论抓取
 * - 微信公众号 (mp.weixin.qq.com) - 支持文章内容、作者、封面图提取
 * - 知乎问答 (zhihu.com/question) - 支持问题、回答、点赞数、评论数提取
 * - 知乎专栏 (zhuanlan.zhihu.com) - 支持文章内容、作者、发布时间提取
 * - 即刻 (okjike.com) - 支持帖子内容、作者信息、互动数据、评论抓取
 * - X.com (x.com/twitter.com) - 支持推文内容、作者信息、互动数据、媒体、引用推文、评论抓取
 * - Reddit (reddit.com) - 支持帖子内容、作者信息、互动数据、子版块信息、评论抓取
 * - 通用网站 - 自动提取标题和正文内容
 * 
 * 主要功能：
 * ---------
 * 1. 自动识别网站类型并应用相应的提取策略
 * 2. 支持自定义URL规则和请求头（headers）
 * 3. 支持从URL、HTML内容或本地文件抓取
 * 4. 支持小红书评论分页抓取（可配置最大页数）
 * 5. 智能处理JavaScript注入的JSON数据
 * 6. 结构化提取内容（标题、正文、图片、作者、统计数据等）
 * 7. 即刻移动版URL自动转换为PC版
 * 8. X.com 推文完整数据提取，包括媒体、引用推文和评论
 * 9. Reddit 帖子完整数据提取，包括标题、内容、作者、子版块、互动数据和评论
 * 
 * 使用方法：
 * ---------
 * ```javascript
 * const WebScraper = require('./modules/webScraper');
 * 
 * // 方式1：从URL抓取
 * const scraper = new WebScraper('https://www.xiaohongshu.com/explore/xxx', null, {
 *     maxCommentPages: 3  // 抓取最多3页评论
 * });
 * const result = await scraper.scrape();
 * 
 * // 方式2：从HTML内容抓取
 * const scraper2 = new WebScraper('https://example.com');
 * const result2 = await scraper2.scrapeFromHtml(htmlContent);
 * 
 * // 方式3：从本地文件抓取（测试用）
 * const scraper3 = new WebScraper('https://example.com');
 * const result3 = await scraper3.testExtractionFromFile('./test.html');
 * 
 * // 方式4：自定义URL规则
 * const customRules = JSON.stringify([{
 *     name: 'xiaohongshu',
 *     headers: {
 *         'Cookie': 'your-cookie-here'
 *     }
 * }]);
 * const scraper4 = new WebScraper(url, customRules);
 * 
 * // 方式5：抓取即刻帖子（支持PC版和移动版URL）
 * const scraper5 = new WebScraper('https://web.okjike.com/u/xxx/post/xxx', JSON.stringify([{
 *     name: 'jike',
 *     headers: { 'Cookie': 'your-jike-cookie' }
 * }]));
 * const result5 = await scraper5.scrape();
 * 
 * // 方式6：抓取 X.com 推文（可能需要 Cookie 认证）
 * const scraper6 = new WebScraper('https://x.com/username/status/1234567890', JSON.stringify([{
 *     name: 'x_com',
 *     headers: { 'Cookie': 'your-x-com-cookie' }
 * }]));
 * const result6 = await scraper6.scrape();
 * 
 * // 方式7：抓取 Reddit 帖子
 * const scraper7 = new WebScraper('https://www.reddit.com/r/subreddit/comments/postid/title/');
 * const result7 = await scraper7.scrape();
 * ```
 * 
 * 返回数据格式：
 * -------------
 * 根据网站类型返回不同的数据结构：
 * - 小红书：title, description, content, image_urls, note_comment, note_like, 
 *          note_collect, user_id, nickname, user_url, comments, total_comments_count
 * - 微信公众号：title, cover_url, description, author, content
 * - 知乎问答：title, author_name, content, upvote_count, comment_count
 * - 知乎专栏：title, author_name, publish_time, content, upvote_count, comment_count
 * - 即刻：content, image_urls, author_name, author_id, author_avatar, publish_time,
 *        like_count, comment_count, share_count, topic_name, topic_url, comments
 * - X.com：content, author_name, author_username, author_id, author_avatar, publish_time,
 *         like_count, retweet_count, reply_count, view_count, image_urls, video_urls,
 *         media_count, quoted_tweet, comments
 * - Reddit：title, content, author_name, author_id, publish_time, upvote_count, comment_count,
 *          subreddit_name, subreddit_url, image_urls, comments
 * - 通用网站：title, content
 * 
 * CHANGELOG：
 * ==========
 * 
 * ## [1.5.0] - 2025-12-21
 * 
 * ### 新增
 * - ✨ 支持 Reddit (reddit.com) 内容抓取，包括帖子详情页
 * - ✨ 支持 Reddit 帖子完整数据提取：标题、内容、作者信息、互动数据（点赞、评论数）
 * - ✨ 支持 Reddit 子版块信息提取
 * - ✨ 支持 Reddit 评论列表提取，包括嵌套回复
 * - ✨ 使用稳定选择器策略，优先使用 data-testid 属性和稳定的链接模式
 * 
 * ## [1.4.0] - 2025-12-21
 * 
 * ### 新增
 * - ✨ 支持 X.com (Twitter) 内容抓取，包括 x.com 和 twitter.com 域名
 * - ✨ 支持推文完整数据提取：内容、作者信息、互动数据（点赞、转发、回复、查看）
 * - ✨ 支持推文媒体提取：图片和视频URL列表
 * - ✨ 支持引用推文提取
 * - ✨ 支持评论列表提取
 * - ✨ 使用稳定选择器策略，优先使用 data-testid 属性
 * 
 * ## [1.3.0] - 2025-12-20
 * 
 * ### 新增
 * - ✨ 支持即刻(okjike.com)内容抓取，包括PC版和移动版URL
 * - ✨ 即刻移动版URL自动转换为PC版进行抓取
 * - ✨ 支持即刻评论和嵌套回复抓取
 * - ✨ 使用稳定选择器策略，避免CSS-in-JS动态类名问题
 * 
 * ## [1.2.0] - 2025-12-20
 * 
 * ### 新增
 * - ✨ 支持小红书评论分页抓取，可通过 maxCommentPages 配置最大抓取页数
 * 
 * ### 改进
 * - 🔄 优化小红书meta标签提取，同时支持 name 和 property 属性
 * - 🔄 增强知乎内容提取，支持结构化富文本（链接卡片、列表、格式化文本等）
 * - 🔄 改进JSON解析，安全处理JavaScript特有的值（undefined, NaN, Infinity等）
 * - 🔄 优化微信公众号内容提取，支持Markdown格式输出
 * - 🔄 添加通用网站标题提取的多重备选策略
 * 
 * ## [1.1.0] - 2024-06-01
 * 
 * ### 新增
 * - ✨ 添加自定义URL规则支持
 * - ✨ 添加从HTML内容和本地文件抓取的功能
 * 
 * ### 改进
 * - 🔄 优化错误处理和日志输出
 * - 🔄 添加知乎会话建立机制，提高抓取成功率
 * - 🔄 支持微信公众号URL清理（移除无用参数）
 * 
 * ## [1.0.0] - 2024-01-01
 * 
 * ### 新增
 * - ✨ 初始版本发布
 * - ✨ 支持小红书、微信公众号、知乎问答和专栏的基础内容提取
 * 
 * 版本说明：
 * ---------
 * - **主版本号** (x.0.0): 不兼容的 API 变更
 * - **次版本号** (0.x.0): 新增功能，向后兼容
 * - **修订号** (0.0.x): 问题修复和小改进
 */

import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';

class WebScraper {
    /**
     * 构造函数
     * @param {string} url 要抓取的URL
     * @param {string|null} urlRulesJson 自定义URL规则（JSON字符串）
     * @param {Object} options 配置选项
     * @param {number} options.maxCommentPages 最多抓取的评论页数，默认为0（不抓取评论）
     */
    constructor(url, urlRulesJson = null, options = {}) {
        this.url = url;
        this.content = null;
        this.$ = null;
        this.urlRules = this.getDefaultUrlRules();
        this.maxCommentPages = options.maxCommentPages !== undefined ? options.maxCommentPages : 0;

        if (urlRulesJson) {
            try {
                const customUrlRules = JSON.parse(urlRulesJson);
                this.updateHeaders(customUrlRules);
            } catch (error) {
                console.error('解析自定义URL规则失败:', error);
            }
        }
    }

    getDefaultUrlRules() {
        return [
            {
                pattern: /^https:\/\/www\.xiaohongshu\.com\/explore\/\w+/,
                parser: 'html.parser',
                name: 'xiaohongshu',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                },
                extractor: 'extractXiaohongshuContent'
            },
            {
                pattern: /^https?:\/\/mp\.weixin\.qq\.com\/s(\?[\w=&%]+|\/[-\w]+)/,
                parser: 'html.parser',
                name: 'wechat',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/18A373 MicroMessenger/8.0.1(0x18000129) NetType/WIFI Language/zh_CN'
                },
                extractor: 'extractWechatContent'
            },
            {
                pattern: /^https?:\/\/mp\.weixin\.qq\.com\/mp\/appmsg\/show(\?[\w=&%#]+)?/,
                parser: 'html.parser',
                name: 'wechat_old',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/18A373 MicroMessenger/8.0.1(0x18000129) NetType/WIFI Language/zh_CN'
                },
                extractor: 'extractWechatContent'
            },
            {
                pattern: /^https:\/\/www\.zhihu\.com\/question\/\d+\/answer\/\d+/,
                parser: 'html.parser',
                name: 'zhihu_answer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.zhihu.com/',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"'
                },
                extractor: 'extractZhihuAnswerContent'
            },
            {
                pattern: /^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+/,
                parser: 'html.parser',
                name: 'zhihu_zhuanlan',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.zhihu.com/',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"'
                },
                extractor: 'extractZhihuZhuanlanContent'
            },
            {
                pattern: /^https:\/\/web\.okjike\.com\/u\/[\w-]+\/post\/[\w]+/,
                parser: 'html.parser',
                name: 'jike',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://web.okjike.com/'
                },
                extractor: 'extractJikeContent'
            },
            {
                pattern: /^https:\/\/web\.okjike\.com\/originalPost\/[\w]+/,
                parser: 'html.parser',
                name: 'jike_original',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://web.okjike.com/'
                },
                extractor: 'extractJikeContent'
            },
            {
                pattern: /^https:\/\/m\.okjike\.com\/originalPosts\/[\w]+/,
                parser: 'html.parser',
                name: 'jike_mobile',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://web.okjike.com/'
                },
                extractor: 'extractJikeContent'
            },
            {
                pattern: /^https:\/\/(x\.com|twitter\.com)\/\w+\/(status|article)\/\d+/,
                parser: 'html.parser',
                name: 'x_com',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://x.com/'
                },
                extractor: 'extractXComContent'
            },
            {
                pattern: /^https:\/\/www\.reddit\.com\/r\/[\w]+\/comments\/[\w]+\//,
                parser: 'html.parser',
                name: 'reddit',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.reddit.com/'
                },
                extractor: 'extractRedditContent'
            },
            {
                pattern: /.*/,
                parser: 'html.parser',
                name: 'general',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                },
                extractor: 'extractGeneralContent'
            }
        ];
    }

    updateHeaders(customUrlRules) {
        for (const customRule of customUrlRules) {
            const name = customRule.name;
            const headers = customRule.headers || {};

            // 找到匹配的默认规则并更新 headers
            for (const rule of this.urlRules) {
                if (rule.name === name) {
                    Object.assign(rule.headers, headers);
                    break;
                }
            }
        }
    }

    async fetchContent() {
        const rule = this.detectUrlType();
        const headers = rule ? rule.headers : {};

        if (rule && rule.name === 'wechat') {
            this.url = this.cleanUrl(this.url);
            console.log(`Cleaned URL: ${this.url}`);
        }

        // 对于即刻移动版URL，转换为PC版URL
        if (rule && rule.name === 'jike_mobile') {
            const postId = this.url.match(/originalPosts\/([\w]+)/)?.[1];
            if (postId) {
                this.url = `https://web.okjike.com/originalPost/${postId}`;
                console.log(`即刻移动版URL已转换为PC版: ${this.url}`);
            }
        }

        // 对于知乎，先访问首页建立会话（如果有cookies）
        if ((rule && (rule.name === 'zhihu_answer' || rule.name === 'zhihu_zhuanlan')) && headers['Cookie']) {
            try {
                console.log('正在访问知乎首页建立会话...');
                const homeUrl = 'https://www.zhihu.com/';
                const homeHeaders = { ...headers };
                // 移除可能干扰的headers
                delete homeHeaders['Referer'];
                homeHeaders['Referer'] = 'https://www.zhihu.com/';
                
                const homeResponse = await fetch(homeUrl, {
                    headers: homeHeaders,
                    signal: AbortSignal.timeout(10000),
                    redirect: 'follow'
                });
                if (homeResponse.status >= 500) {
                    throw new Error(`Request failed with status code ${homeResponse.status}`);
                }
                await homeResponse.text(); // consume body
                console.log('✓ 会话建立成功');
                
                // 等待一小段时间，模拟真实浏览行为
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('⚠ 访问首页建立会话失败，将继续尝试直接访问目标页面');
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            // 添加 Connection header
            const finalHeaders = {
                ...headers,
                'Connection': 'keep-alive',
                'DNT': '1'
            };

            const response = await fetch(this.url, {
                headers: finalHeaders,
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeoutId);

            if (!response.ok && response.status >= 500) {
                const err = new Error(`Request failed with status code ${response.status}`);
                err.response = { status: response.status, statusText: response.statusText };
                throw err;
            }

            if (response.status >= 400) {
                console.error(`Error fetching ${this.url}: Request failed with status code ${response.status}`);
                if (response.status === 403) {
                    console.error('403 Forbidden - 可能的原因：');
                    console.error('  1. Cookies 已过期或无效');
                    console.error('  2. 需要登录才能访问');
                    console.error('  3. 请求被反爬虫系统拦截');
                    console.error('  4. 建议：在浏览器中打开该页面，确认可以正常访问');
                    // 不打印完整的headers，避免输出过长
                    console.error(`  使用的 Cookie 数量: ${headers['Cookie'] ? headers['Cookie'].split(';').length : 0}`);
                }
                this.content = null;
                const err = new Error(`Request failed with status code ${response.status}`);
                err.response = { status: response.status, statusText: response.statusText };
                throw err;
            }

            this.content = await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error(`Error fetching ${this.url}:`, 'Request timeout');
            } else if (error.response) {
                console.error(`Error fetching ${this.url}: Request failed with status code ${error.response.status}`);
                if (error.response.status === 403) {
                    console.error('提示：如果持续出现 403 错误，可能需要：');
                    console.error('  1. 确认浏览器中已登录知乎');
                    console.error('  2. 重新获取 cookies');
                    console.error('  3. 使用浏览器自动化工具（如 Puppeteer）来抓取');
                }
            } else {
                console.error(`Error fetching ${this.url}:`, error.message);
            }
            this.content = null;
            throw error;
        }
    }

    cleanUrl(url) {
        try {
            // 将 HTML 实体解码为普通字符
            url = this.htmlDecode(url);
            
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            
            // 删除不需要的参数
            params.delete('chksm');
            params.delete('scene');
            
            urlObj.search = params.toString();
            
            return urlObj.toString();
        } catch (error) {
            console.error('URL清理失败:', error);
            return url;
        }
    }

    htmlDecode(str) {
        return str.replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'");
    }

    /**
     * 安全地解析JSON字符串，处理JavaScript特有的值
     * @param {string} jsonString 要解析的JSON字符串
     * @returns {Object} 解析后的对象
     */
    safeJsonParse(jsonString) {
        try {
            // 首先尝试直接解析
            return JSON.parse(jsonString);
        } catch (error) {
            // 如果解析失败，进行更彻底的清理
            let cleanedData = jsonString;
            
            // 处理更多JavaScript特有的值
            cleanedData = cleanedData.replace(/:\s*undefined\s*([,}\]])/g, ': null$1');
            cleanedData = cleanedData.replace(/:\s*NaN\s*([,}\]])/g, ': null$1');
            cleanedData = cleanedData.replace(/:\s*Infinity\s*([,}\]])/g, ': null$1');
            cleanedData = cleanedData.replace(/:\s*-Infinity\s*([,}\]])/g, ': null$1');
            
            // 处理函数调用（如果有的话）
            cleanedData = cleanedData.replace(/:\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*([,}\]])/g, ': null$1');
            
            // 处理正则表达式
            cleanedData = cleanedData.replace(/:\s*\/.*?\/[gimuy]*\s*([,}\]])/g, ': null$1');
            
            try {
                // 再次尝试解析
                return JSON.parse(cleanedData);
            } catch (secondError) {
                console.error('JSON解析彻底失败:', secondError.message);
                // 返回空对象，避免程序崩溃
                return {};
            }
        }
    }

    detectUrlType() {
        for (const rule of this.urlRules) {
            if (rule.pattern.test(this.url)) {
                return rule;
            }
        }
        return null;
    }

    async parseContent() {
        if (!this.content) {
            console.log('No content to parse');
            return null;
        }

        const rule = this.detectUrlType();
        if (rule) {
            console.log(`Detected ${rule.name} content page, using parser: ${rule.parser}`);
            this.$ = cheerio.load(this.content);
        } else {
            console.log('No matching rule found, using default parser');
            this.$ = cheerio.load(this.content);
        }
    }

    async extractContent() {
        const rule = this.detectUrlType();
        if (!rule || !this.$) {
            return {};
        }

        const extractorMethodName = rule.extractor;
        const extractorMethod = this[extractorMethodName];

        if (extractorMethod) {
            return await extractorMethod.call(this);
        } else {
            console.log(`No extractor method found for ${rule.name}`);
            return {};
        }
    }

    async extractXiaohongshuContent() {
        const $ = this.$;
        
        // 提取标题 - 修复：小红书使用 name 而不是 property
        // 尝试两种方式：先尝试 name，再尝试 property（兼容性）
        let titleMeta = $('meta[name="og:title"]');
        if (titleMeta.length === 0) {
            titleMeta = $('meta[property="og:title"]');
        }
        let title = titleMeta.attr('content') || '未找到标题';
        if (title.length > 6 && title.endsWith(' - 小红书')) {
            title = title.slice(0, -6);  // 移除 " - 小红书" 后缀
        }

        // 提取正文 - 保持不变（description 使用 name 属性）
        const descMeta = $('meta[name="description"]');
        const descText = descMeta.attr('content') || '未找到正文';
        const content = descText;

        // 提取图片链接 - 修复：小红书使用 name 而不是 property
        const imageUrls = [];
        $('meta[name="og:image"]').each((i, elem) => {
            imageUrls.push($(elem).attr('content'));
        });
        // 兼容性：如果没找到，尝试 property
        if (imageUrls.length === 0) {
            $('meta[property="og:image"]').each((i, elem) => {
                imageUrls.push($(elem).attr('content'));
            });
        }

        // 提取评论数 - 修复：小红书使用 name 而不是 property
        let noteCommentMeta = $('meta[name="og:xhs:note_comment"]');
        if (noteCommentMeta.length === 0) {
            noteCommentMeta = $('meta[property="og:xhs:note_comment"]');
        }
        const noteComment = noteCommentMeta.attr('content') || '未找到评论数';

        // 提取点赞数 - 修复：小红书使用 name 而不是 property
        let noteLikeMeta = $('meta[name="og:xhs:note_like"]');
        if (noteLikeMeta.length === 0) {
            noteLikeMeta = $('meta[property="og:xhs:note_like"]');
        }
        const noteLike = noteLikeMeta.attr('content') || '未找到点赞数';

        // 提取收藏数 - 修复：小红书使用 name 而不是 property
        let noteCollectMeta = $('meta[name="og:xhs:note_collect"]');
        if (noteCollectMeta.length === 0) {
            noteCollectMeta = $('meta[property="og:xhs:note_collect"]');
        }
        const noteCollect = noteCollectMeta.attr('content') || '未找到收藏数';

        // 从script标签中提取用户信息
        let userId = '未找到用户ID';
        let nickname = '未找到用户昵称';
        let userUrl = '';

        $('script').each((i, elem) => {
            const scriptContent = $(elem).html();
            if (scriptContent && scriptContent.includes('window.__INITIAL_STATE__=')) {
                let data = scriptContent.replace('window.__INITIAL_STATE__=', '');
                
                // 清理数据：移除末尾的分号，处理JavaScript特有的值
                data = data.replace(/;$/, '');
                
                // 将JavaScript的undefined替换为null，使其成为有效的JSON
                data = data.replace(/:\s*undefined\s*([,}])/g, ': null$1');
                
                // 处理其他JavaScript特有的值
                data = data.replace(/:\s*NaN\s*([,}])/g, ': null$1');
                data = data.replace(/:\s*Infinity\s*([,}])/g, ': null$1');
                data = data.replace(/:\s*-Infinity\s*([,}])/g, ': null$1');
                
                try {
                    // 尝试安全地解析JSON
                    const jsonData = this.safeJsonParse(data);
                    
                    // 检查是否成功解析到有效数据
                    if (jsonData && typeof jsonData === 'object' && Object.keys(jsonData).length > 0) {
                        // 首先尝试从note详情页面获取作者信息
                        const noteDetailMap = jsonData.note?.noteDetailMap || {};
                        for (const [noteId, noteDetail] of Object.entries(noteDetailMap)) {
                            const noteInfo = noteDetail.note;
                            if (noteInfo && noteInfo.user) {
                                const userInfo = noteInfo.user;
                                userId = userInfo.userId || '未找到用户ID';
                                nickname = userInfo.nickname || '未找到用户昵称';
                                userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
                                return false; // 跳出循环
                            }
                        }
                        
                        // 如果note详情页面没有找到，尝试从feeds中查找
                        if (userId === '未找到用户ID') {
                            const currentNoteId = this.url.split('/').pop().split('?')[0];
                            const feeds = jsonData.feed?.feeds || [];
                            
                            let targetNote = feeds.find(feed => feed.id === currentNoteId);
                            if (!targetNote && feeds.length > 0) {
                                targetNote = feeds[0];
                            }
                            
                            if (targetNote) {
                                const noteCard = targetNote.noteCard || {};
                                const userInfo = noteCard.user || {};
                                userId = userInfo.userId || '未找到用户ID';
                                nickname = userInfo.nickname || '未找到用户昵称';
                                userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
                            }
                        }
                    }
                    
                    // 如果JSON解析失败或没有找到用户信息，尝试使用正则表达式提取基本信息
                    if (userId === '未找到用户ID') {
                        const userIdMatch = scriptContent.match(/"userId":\s*"([^"]+)"/);
                        const nicknameMatch = scriptContent.match(/"nickname":\s*"([^"]+)"/);
                        
                        if (userIdMatch) {
                            userId = userIdMatch[1];
                            userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
                        }
                        if (nicknameMatch) {
                            nickname = nicknameMatch[1];
                        }
                    }
                } catch (error) {
                    console.error('处理script标签数据时出错:', error);
                    // 如果所有方法都失败，尝试使用正则表达式提取基本信息
                    try {
                        const userIdMatch = scriptContent.match(/"userId":\s*"([^"]+)"/);
                        const nicknameMatch = scriptContent.match(/"nickname":\s*"([^"]+)"/);
                        
                        if (userIdMatch) {
                            userId = userIdMatch[1];
                            userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
                        }
                        if (nicknameMatch) {
                            nickname = nicknameMatch[1];
                        }
                    } catch (regexError) {
                        console.error('正则表达式提取失败:', regexError);
                    }
                }
            }
        });

        // 获取评论信息（使用配置的最大页数）
        const { comments, totalCount } = await this.fetchXhsComments(this.url, this.maxCommentPages);

        return {
            title,
            description: descText,
            content,
            image_urls: imageUrls,
            note_comment: noteComment,
            note_like: noteLike,
            note_collect: noteCollect,
            user_id: userId,
            nickname,
            user_url: userUrl,
            comments,
            total_comments_count: totalCount,
            source_url: this.url
        };
    }

    extractWechatContent() {
        const $ = this.$;
        
        // 提取标题
        const titleElement = $('.rich_media_title');
        const title = titleElement.text().trim() || '未找到标题';

        // 提取概述
        const descMeta = $('meta[name="description"]');
        const descText = descMeta.attr('content') || '未找到概述';

        // 提取头图链接
        const coverMeta = $('meta[property="og:image"]');
        const coverUrl = coverMeta.attr('content') || '';

        // 提取作者
        const authorMeta = $('meta[name="author"]');
        const authorText = authorMeta.attr('content') || '未找到作者';

        // 提取正文
        const contentDiv = $('.rich_media_content');
        let content = '';
        
        if (contentDiv.length > 0) {
            content = this.extractTextWithNewlines(contentDiv);
            content = content.replace(/\n\n+/g, '\n\n'); // 将多个连续的换行符替换为两个
        } else {
            content = '未找到正文内容';
        }

        return {
            title,
            cover_url: coverUrl,
            description: descText,
            author: authorText,
            content,
            source_url: this.url
        };
    }

    extractTextWithNewlines(element) {
        let text = '';
        const $ = this.$;
        
        element.contents().each((i, child) => {
            const $child = $(child);
            
            if (child.type === 'tag') {
                const tagName = child.name.toLowerCase();
                
                switch (tagName) {
                    case 'img':
                        const imgSrc = $child.attr('data-src') || '';
                        const imgAlt = $child.attr('alt') || '';
                        text += `\n![${imgAlt}](${imgSrc})\n`;
                        break;
                    case 'h1':
                        text += `# ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'h2':
                        text += `## ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'h3':
                        text += `### ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'h4':
                        text += `#### ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'h5':
                        text += `##### ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'h6':
                        text += `###### ${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'p':
                        text += `${this.extractTextWithNewlines($child)}\n\n`;
                        break;
                    case 'strong':
                    case 'b':
                        text += `**${this.extractTextWithNewlines($child)}**`;
                        break;
                    case 'em':
                    case 'i':
                        text += `*${this.extractTextWithNewlines($child)}*`;
                        break;
                    case 'ul':
                        text += `${this.extractTextWithNewlines($child)}\n`;
                        break;
                    case 'ol':
                        text += `${this.extractTextWithNewlines($child)}\n`;
                        break;
                    case 'li':
                        const parent = $child.parent();
                        if (parent.is('ul')) {
                            text += `- ${this.extractTextWithNewlines($child)}\n`;
                        } else if (parent.is('ol')) {
                            text += `1. ${this.extractTextWithNewlines($child)}\n`;
                        }
                        break;
                    case 'a':
                        const href = $child.attr('href') || '#';
                        const linkText = this.extractTextWithNewlines($child);
                        text += `[${linkText}](${href})`;
                        break;
                    default:
                        text += this.extractTextWithNewlines($child);
                        break;
                }
            } else if (child.type === 'text') {
                text += child.data || '';
            }
        });
        
        return text;
    }

    extractZhihuAnswerContent() {
        const $ = this.$;

        // 提取问题标题
        let questionTitle = '未找到问题标题';
        const titleMeta = $('meta[itemprop="name"]');
        if (titleMeta.length && titleMeta.attr('content')) {
            questionTitle = titleMeta.attr('content');
        } else {
            const questionTitleTag = $('.QuestionHeader-title');
            if (questionTitleTag.length) {
                questionTitle = questionTitleTag.text().trim();
            }
        }

        // 提取回答作者
        let authorName = '未找到作者';
        
        // 方法1：从data-zop属性中提取
        const contentItem = $('.ContentItem.AnswerItem');
        if (contentItem.length && contentItem.attr('data-zop')) {
            try {
                const dataZop = JSON.parse(contentItem.attr('data-zop'));
                if (dataZop.authorName) {
                    authorName = dataZop.authorName;
                }
            } catch (error) {
                console.error('解析data-zop失败:', error);
            }
        }
        
        // 方法2：从AuthorInfo div中提取
        if (authorName === '未找到作者') {
            let authorDiv = $('.AuthorInfo.AnswerItem-authorInfo.AnswerItem-authorInfo--related');
            if (!authorDiv.length) {
                authorDiv = $('.AuthorInfo');
            }
            
            if (authorDiv.length) {
                const authorNameTag = authorDiv.find('meta[itemprop="name"]');
                if (authorNameTag.length && authorNameTag.attr('content')) {
                    authorName = authorNameTag.attr('content');
                }
            }
        }
        
        // 方法3：从UserLink中提取
        if (authorName === '未找到作者') {
            const userLink = $('.UserLink-link');
            if (userLink.length) {
                authorName = userLink.text().trim();
            }
        }

        // 提取回答内容 - 使用新的结构化抽取方法
        let answerContent = '未找到回答内容';
        const richContentInner = $('.RichContent-inner');
        
        if (richContentInner.length) {
            // 查找包含实际内容的span标签
            const richTextSpan = richContentInner.find('span.RichText[itemprop="text"]');
            
            if (richTextSpan.length) {
                answerContent = this.extractZhihuRichText(richTextSpan);
            } else {
                // 备用方法：直接从RichContent-inner提取
                answerContent = this.extractZhihuRichText(richContentInner);
            }
        }

        // 提取点赞数
        const upvoteMeta = $('meta[itemprop="upvoteCount"]');
        const upvoteCount = upvoteMeta.attr('content') || '0';

        // 提取评论数
        const commentMeta = $('meta[itemprop="commentCount"]');
        const commentCount = commentMeta.attr('content') || '0';

        return {
            title: questionTitle,
            author_name: authorName,
            content: answerContent,
            upvote_count: upvoteCount,
            comment_count: commentCount,
            source_url: this.url
        };
    }

    extractZhihuRichText(element) {
        const $ = this.$;
        let text = '';
        
        element.contents().each((i, child) => {
            const $child = $(child);
            
            if (child.type === 'tag') {
                const tagName = child.name.toLowerCase();
                
                switch (tagName) {
                    case 'p':
                        const pText = this.extractZhihuRichText($child);
                        if (pText.trim()) {
                            text += `${pText}\n\n`;
                        }
                        break;
                    case 'b':
                    case 'strong':
                        text += `**${this.extractZhihuRichText($child)}**`;
                        break;
                    case 'em':
                    case 'i':
                        text += `*${this.extractZhihuRichText($child)}*`;
                        break;
                    case 'a':
                        const href = $child.attr('href') || '#';
                        const linkText = this.extractZhihuRichText($child);
                        // 处理知乎链接，移除SVG图标
                        const cleanLinkText = linkText.replace(/\s*$/, ''); // 去掉末尾空白
                        text += `[${cleanLinkText}](${href})`;
                        break;
                    case 'ol':
                        text += `${this.extractZhihuRichText($child)}\n`;
                        break;
                    case 'ul':
                        text += `${this.extractZhihuRichText($child)}\n`;
                        break;
                    case 'li':
                        const parent = $child.parent();
                        const liText = this.extractZhihuRichText($child);
                        if (parent.is('ol')) {
                            // 有序列表，尝试获取索引
                            const index = $child.index() + 1;
                            text += `${index}. ${liText}\n`;
                        } else {
                            text += `- ${liText}\n`;
                        }
                        break;
                    case 'hr':
                        text += '\n---\n\n';
                        break;
                    case 'div':
                        // 处理LinkCard等特殊div
                        if ($child.hasClass('RichText-LinkCardContainer')) {
                            const linkCard = $child.find('.LinkCard');
                            const cardTitle = linkCard.find('.LinkCard-title').text().trim();
                            const cardDesc = linkCard.find('.LinkCard-desc').text().trim();
                            const cardHref = linkCard.attr('href') || '#';
                            if (cardTitle) {
                                text += `\n[${cardTitle}](${cardHref})\n${cardDesc ? `> ${cardDesc}` : ''}\n\n`;
                            }
                        } else {
                            text += this.extractZhihuRichText($child);
                        }
                        break;
                    case 'span':
                        // 忽略SVG图标等装饰性span
                        if (!$child.hasClass('ZDI') && !$child.find('svg').length) {
                            text += this.extractZhihuRichText($child);
                        }
                        break;
                    case 'svg':
                        // 忽略SVG图标
                        break;
                    default:
                        text += this.extractZhihuRichText($child);
                        break;
                }
            } else if (child.type === 'text') {
                text += child.data || '';
            }
        });
        
        return text;
    }

    extractZhihuZhuanlanContent() {
        const $ = this.$;

        // 提取文章标题
        let title = '未找到文章标题';
        const ogTitleMeta = $('meta[property="og:title"]');
        if (ogTitleMeta.length && ogTitleMeta.attr('content')) {
            title = ogTitleMeta.attr('content');
        } else {
            const titleTag = $('title');
            if (titleTag.length) {
                let titleText = titleTag.text().trim();
                if (titleText.endsWith(' - 知乎')) {
                    title = titleText.slice(0, -5);
                } else {
                    title = titleText;
                }
            }
        }

        // 提取作者名称
        let authorName = '未找到作者';
        const authorDiv = $('.AuthorInfo');
        if (authorDiv.length) {
            const authorNameTag = authorDiv.find('meta[itemprop="name"]');
            if (authorNameTag.length && authorNameTag.attr('content')) {
                authorName = authorNameTag.attr('content');
            }
        }

        // 提取发布时间
        let publishTime = '未找到发布时间';
        const publishTimeTag = $('.ContentItem-time');
        if (publishTimeTag.length) {
            publishTime = publishTimeTag.text().trim();
        }

        // 提取文章内容
        const contentDiv = $('.Post-RichTextContainer');
        let articleContent = '未找到文章内容';
        if (contentDiv.length) {
            articleContent = contentDiv.text().trim();
        }

        // 提取点赞数
        const upvoteButton = $('.VoteButton--up');
        let upvoteCount = '0';
        if (upvoteButton.length) {
            upvoteCount = upvoteButton.text().trim().replace('已赞同', '').trim();
        }

        // 提取评论数
        const commentButton = $('.BottomActions-CommentBtn');
        let commentCount = '0';
        if (commentButton.length) {
            commentCount = commentButton.text().trim().replace('添加评论', '').trim();
        }

        return {
            title,
            author_name: authorName,
            publish_time: publishTime,
            content: articleContent,
            upvote_count: upvoteCount,
            comment_count: commentCount,
            source_url: this.url
        };
    }

    /**
     * 提取即刻帖子内容
     * 使用稳定选择器策略，避免动态生成的类名
     */
    extractJikeContent() {
        const $ = this.$;
        
        // 定位主内容容器 - 使用 mantine-Container-root
        const mainContainer = $('.mantine-Container-root').first();
        
        // 定位主帖子区域 - data-clickable-feedback="false" 的元素是主帖子
        const mainPost = mainContainer.find('[data-clickable-feedback="false"]').first();
        
        // 提取作者信息 - 使用稳定的用户链接选择器
        // 主帖子内的第一个用户链接是作者
        const authorLink = mainPost.find('a[href^="/u/"]').first();
        const authorHref = authorLink.attr('href') || '';
        const authorId = authorHref.match(/\/u\/([\w-]+)/)?.[1] || '';
        
        // 作者昵称 - 在 .jk-link-text 内的 span（稳定类名）
        const authorNameElem = mainPost.find('.jk-link-text span').first();
        const authorName = authorNameElem.text().trim() || '未知作者';
        
        // 作者头像 - 使用 .jk-avatar 或 img[alt="avatar"]
        const authorAvatarElem = mainPost.find('img.jk-avatar, img[alt="avatar"]').first();
        const authorAvatar = authorAvatarElem.attr('src') || '';
        
        // 提取发布时间 - 在作者区域附近寻找日期格式的文本
        // 日期通常在作者昵称旁边，格式如 "12/09" 或 "8天前"
        let publishTime = '';
        mainPost.find('div').each((i, elem) => {
            const text = $(elem).text().trim();
            // 匹配日期格式：MM/DD 或 X天前 或 X小时前
            if (/^\d{1,2}\/\d{1,2}$/.test(text) || /^\d+[天小时分钟]+前$/.test(text)) {
                publishTime = text;
                return false; // 找到后停止
            }
        });
        
        // 提取帖子正文 - 寻找包含主要文本内容的元素
        // 正文通常是较长的文本块，排除导航和按钮文本
        let content = '';
        mainPost.find('div').each((i, elem) => {
            const $elem = $(elem);
            // 跳过包含子元素div的容器（寻找叶子节点）
            if ($elem.children('div').length > 0) return;
            // 跳过包含SVG或按钮的元素
            if ($elem.find('svg, button').length > 0) return;
            
            const text = $elem.text().trim();
            // 如果文本足够长且不是日期/数字，可能是正文
            if (text.length > 20 && !/^\d+$/.test(text) && !/^\d{1,2}\/\d{1,2}$/.test(text)) {
                if (text.length > content.length) {
                    content = text;
                }
            }
        });
        
        // 提取图片列表 - 使用 img[alt="图片"] 或非头像图片
        const imageUrls = [];
        mainPost.find('img[alt="图片"], img[referrerpolicy="no-referrer"]').each((i, elem) => {
            const src = $(elem).attr('src');
            // 过滤掉头像图片（通常包含 thumbnail 参数且尺寸小）
            // 过滤掉赞助者图标等小图标
            if (src && 
                !src.includes('!120x120') && 
                !$(elem).hasClass('jk-avatar') &&
                !$(elem).hasClass('sponsor-icon') &&
                !src.includes('userProfile/DEFAULT_STROKED')) {
                imageUrls.push(src);
            }
        });
        
        // 提取话题信息 - 使用稳定的话题链接选择器
        const topicLink = mainPost.find('a[href^="/topic/"]').first();
        const topicHref = topicLink.attr('href') || '';
        const topicName = topicLink.text().trim() || '';
        const topicUrl = topicHref ? `https://web.okjike.com${topicHref}` : '';
        
        // 提取互动数据 - 通过 SVG 图标的父元素定位
        // 点赞、评论、分享通常在一个横向排列的容器中
        let likeCount = '0';
        let commentCount = '0';
        let shareCount = '0';
        
        // 查找包含互动按钮的区域 - 通过 tabindex="0" 的可交互元素
        const interactionElements = mainPost.find('[tabindex="0"]');
        const interactionTexts = [];
        
        interactionElements.each((i, elem) => {
            const $elem = $(elem);
            // 只取包含 SVG 和数字的元素
            if ($elem.find('svg').length > 0) {
                const text = $elem.clone().children('svg').remove().end().text().trim();
                if (/^\d+$/.test(text)) {
                    interactionTexts.push(text);
                }
            }
        });
        
        // 按顺序分配：点赞、评论、分享
        if (interactionTexts.length >= 1) likeCount = interactionTexts[0];
        if (interactionTexts.length >= 2) commentCount = interactionTexts[1];
        if (interactionTexts.length >= 3) shareCount = interactionTexts[2];
        
        // 提取评论
        const comments = this.extractJikeComments();
        
        return {
            content,
            image_urls: imageUrls,
            author_name: authorName,
            author_id: authorId,
            author_avatar: authorAvatar,
            publish_time: publishTime,
            like_count: likeCount,
            comment_count: commentCount,
            share_count: shareCount,
            topic_name: topicName,
            topic_url: topicUrl,
            comments,
            source_url: this.url
        };
    }

    /**
     * 提取即刻评论列表
     * @returns {Array} 评论数组
     */
    extractJikeComments() {
        const $ = this.$;
        const comments = [];
        
        // 查找包含"全部评论"文本的元素，其后是评论区
        let commentSection = null;
        $('header, span').each((i, elem) => {
            if ($(elem).text().includes('全部评论')) {
                // 评论区通常是这个元素的兄弟或父级的下一个元素
                commentSection = $(elem).closest('section').find('[data-clickable-feedback="true"]');
                if (commentSection.length === 0) {
                    commentSection = $(elem).parent().parent().find('[data-clickable-feedback="true"]');
                }
                return false;
            }
        });
        
        if (!commentSection || commentSection.length === 0) {
            // 备选方案：直接查找评论区的 data-clickable-feedback="true" 元素
            // 排除主帖子区域
            const mainContainer = $('.mantine-Container-root').first();
            commentSection = mainContainer.find('[data-clickable-feedback="true"]');
        }
        
        commentSection.each((i, elem) => {
            const $comment = $(elem);
            const comment = this.extractSingleJikeComment($comment);
            if (comment && comment.content) {
                comments.push(comment);
            }
        });
        
        return comments;
    }

    /**
     * 提取单条即刻评论
     * @param {Object} $comment jQuery 评论元素
     * @param {boolean} isReply 是否为回复（用于区分处理逻辑）
     * @returns {Object} 评论对象
     */
    extractSingleJikeComment($comment, isReply = false) {
        const $ = this.$;
        
        // 克隆元素以避免修改原始DOM，同时移除嵌套的回复区域以便提取纯评论内容
        const $commentClone = $comment.clone();
        // 移除回复区域，只保留主评论内容
        $commentClone.find('[data-clickable-feedback="false"]').remove();
        
        // 提取评论作者
        const authorLink = $commentClone.find('a[href^="/u/"]').first();
        const authorHref = authorLink.attr('href') || '';
        const authorId = authorHref.match(/\/u\/([\w-]+)/)?.[1] || '';
        const authorName = $commentClone.find('.jk-link-text span').first().text().trim() || '';
        const authorAvatar = $commentClone.find('img.jk-avatar, img[alt="avatar"]').first().attr('src') || '';
        
        // 提取评论时间 - 从克隆的元素中查找
        let time = '';
        $commentClone.find('div').each((i, elem) => {
            const text = $(elem).text().trim();
            if (/^\d{1,2}\/\d{1,2}$/.test(text) || /^\d+[天小时分钟]+前$/.test(text)) {
                time = text;
                return false;
            }
        });
        
        // 提取评论内容 - 寻找评论文本
        // 收集所有可能的用户名（包括被回复者）以便排除
        const allUserNames = [];
        $commentClone.find('.jk-link-text span').each((i, elem) => {
            const name = $(elem).text().trim();
            if (name) allUserNames.push(name);
        });
        
        let content = '';
        $commentClone.find('div').each((i, elem) => {
            const $elem = $(elem);
            if ($elem.children('div').length > 0) return;
            if ($elem.find('svg, button, img, a').length > 0) return;
            
            const text = $elem.text().trim();
            // 评论内容通常比较短，但不是日期或数字
            if (text.length > 0 && text.length < 1000 && 
                !/^\d+$/.test(text) && 
                !/^\d{1,2}\/\d{1,2}$/.test(text) &&
                !/^\d+[天小时分钟]+前$/.test(text) &&
                !allUserNames.includes(text) &&
                text !== '作者' &&
                text !== '回复' &&
                !text.startsWith('回复')) {
                // 取第一个符合条件的文本（通常是评论内容）
                if (!content) {
                    content = text;
                }
            }
        });
        
        // 提取点赞数
        let likeCount = '0';
        $commentClone.find('[tabindex="0"]').each((i, elem) => {
            const $elem = $(elem);
            if ($elem.find('svg').length > 0) {
                const text = $elem.clone().children('svg').remove().end().text().trim();
                if (/^\d+$/.test(text)) {
                    likeCount = text;
                    return false; // 第一个数字是点赞数
                }
            }
        });
        
        // 提取嵌套回复 - 从原始元素中查找 data-clickable-feedback="false" 的子元素
        const replies = [];
        if (!isReply) {
            $comment.find('[data-clickable-feedback="false"]').each((i, elem) => {
                const reply = this.extractSingleJikeComment($(elem), true);
                if (reply && reply.content) {
                    replies.push(reply);
                }
            });
        }
        
        return {
            author_name: authorName,
            author_id: authorId,
            author_avatar: authorAvatar,
            content,
            like_count: likeCount,
            time,
            replies
        };
    }

    /**
     * 提取 X.com (Twitter) 帖子内容
     * 使用稳定选择器策略，优先使用 data-testid 属性
     */
    extractXComContent() {
        const $ = this.$;
        
        // 定位主推文容器 - 使用 data-testid="tweet" 或 role="article"
        const mainTweet = $('[data-testid="tweet"]').first();
        if (mainTweet.length === 0) {
            // 备选方案：使用 role="article"
            const articleTweets = $('[role="article"]');
            if (articleTweets.length > 0) {
                // 第一个 article 通常是主推文
                const firstArticle = articleTweets.first();
                return this.extractXComTweetFromElement($(firstArticle));
            }
            return this.extractXComTweetFromElement($('body'));
        }
        
        return this.extractXComTweetFromElement(mainTweet);
    }

    /**
     * 从指定元素提取 X.com 推文数据
     * @param {Object} $tweetElement jQuery 推文元素
     * @returns {Object} 推文数据对象
     */
    extractXComTweetFromElement($tweetElement) {
        const $ = this.$;
        
        // 提取作者信息
        const authorNameElem = $tweetElement.find('[data-testid="User-Name"]').first();
        let authorName = '';
        let authorUsername = '';
        let authorId = '';
        let authorAvatar = '';
        
        if (authorNameElem.length > 0) {
            // 作者显示名通常在第一个 span
            const nameSpans = authorNameElem.find('span');
            if (nameSpans.length >= 2) {
                authorName = nameSpans.eq(0).text().trim();
                authorUsername = nameSpans.eq(1).text().trim();
            } else if (nameSpans.length === 1) {
                authorName = nameSpans.eq(0).text().trim();
            }
            
            // 从链接中提取作者ID
            const authorLink = authorNameElem.find('a[href^="/"]').first();
            if (authorLink.length > 0) {
                const href = authorLink.attr('href') || '';
                const match = href.match(/^\/(\w+)/);
                if (match) {
                    authorId = match[1];
                    if (!authorUsername) {
                        authorUsername = `@${authorId}`;
                    }
                }
            }
        }
        
        // 备选方案：从其他位置提取作者信息
        if (!authorName || /^[\d.,]+[万亿KMB]?$/.test(authorName)) {
            // 支持 /status/ 和 /article/ 两种 URL 格式
            const userLink = $tweetElement.find('a[href^="/"][href*="/status"], a[href^="/"][href*="/article"]').first();
            if (userLink.length > 0) {
                const href = userLink.attr('href') || '';
                const match = href.match(/^\/(\w+)\/(status|article)/);
                if (match) {
                    authorId = match[1];
                    authorUsername = `@${authorId}`;
                }
                // 尝试从父元素获取显示名
                const parentText = userLink.parent().text().trim();
                if (parentText && !parentText.startsWith('@') && !/^[\d.,]+[万亿KMB]?$/.test(parentText)) {
                    authorName = parentText.split('\n')[0].trim();
                }
            }
        }
        
        // 备选方案2：从用户个人资料链接提取作者名（针对 Article 页面）
        if (!authorName || /^[\d.,]+[万亿KMB]?$/.test(authorName)) {
            // 查找指向用户主页的链接（格式: /@username 或 /username，排除 /status 和 /article）
            const profileLinks = $tweetElement.find('a[href^="/"]');
            profileLinks.each((i, elem) => {
                const href = $(elem).attr('href') || '';
                // 匹配用户主页链接（如 /thedankoe），排除 status/article/hashtag 等
                if (/^\/\w+$/.test(href) && !href.includes('/status') && !href.includes('/article') && !href.includes('/hashtag')) {
                    const linkText = $(elem).text().trim();
                    // 确保不是数字（访问量、粉丝数等）
                    if (linkText && !linkText.startsWith('@') && !linkText.startsWith('#') && 
                        !/^[\d.,]+[万亿KMB]?$/.test(linkText) && linkText.length < 50) {
                        if (!authorId) {
                            authorId = href.substring(1); // 移除开头的 /
                            authorUsername = `@${authorId}`;
                        }
                        // 只在还没有有效作者名时设置
                        if (!authorName || /^[\d.,]+[万亿KMB]?$/.test(authorName)) {
                            authorName = linkText;
                            return false; // 找到后停止遍历
                        }
                    }
                }
            });
        }
        
        // 备选方案3：如果仍然没有作者名，使用 author_id 作为显示名
        if (!authorName || /^[\d.,]+[万亿KMB]?$/.test(authorName)) {
            if (authorId) {
                authorName = authorId;
            }
        }
        
        // 提取作者头像
        const avatarImg = $tweetElement.find('img[alt*="profile"], img[src*="pbs.twimg.com/profile_images"]').first();
        if (avatarImg.length > 0) {
            authorAvatar = avatarImg.attr('src') || '';
        }
        
        // 提取推文/文章文本内容
        let content = '';
        let title = ''; // Article 类型的标题
        
        // 检测是否为 Article 类型
        const isArticlePage = this.url.includes('/article/');
        
        if (isArticlePage) {
            // Article 类型：优先使用文章专用选择器
            
            // 提取 Article 标题（多种方法）
            // 方法1: 从 twitter-article-title 元素提取（最可靠）
            const articleTitleElem = $tweetElement.find('[data-testid="twitter-article-title"]').first();
            if (articleTitleElem.length > 0) {
                title = articleTitleElem.text().trim();
            }
            
            // 方法2: 从 h1 标签提取
            if (!title) {
                const h1Elem = $tweetElement.find('h1').first();
                if (h1Elem.length > 0) {
                    title = h1Elem.text().trim();
                }
            }
            
            // 方法3: 从 og:title meta 标签提取（全局搜索，排除无效值）
            if (!title) {
                const ogTitle = this.$('meta[property="og:title"]').attr('content') || 
                               this.$('meta[name="og:title"]').attr('content');
                if (ogTitle) {
                    // 清理标题：移除通知数、后缀等
                    let cleanedTitle = ogTitle.replace(/^\(\d+\)\s*/, '')
                                             .replace(/\s*[\/|]\s*X\s*$/i, '')
                                             .trim();
                    // 排除无效标题
                    if (cleanedTitle && !/^X$/i.test(cleanedTitle) && cleanedTitle.length > 5) {
                        title = cleanedTitle;
                    }
                }
            }
            
            // 方法4: 从 title 标签提取（排除无效标题）
            if (!title) {
                const pageTitle = this.$('title').text();
                if (pageTitle) {
                    // 先移除通知数如 "(7) "，再移除后缀
                    let cleanedTitle = pageTitle.replace(/^\(\d+\)\s*/, '') // 移除通知数
                                               .replace(/\s*[\/|]\s*X\s*$/i, '') // 移除 " / X"
                                               .replace(/\s+on\s+X\s*$/i, '') // 移除 " on X"
                                               .trim();
                    // 排除无效标题（如纯 "X" 或空或太短）
                    if (cleanedTitle && !/^X$/i.test(cleanedTitle) && cleanedTitle.length > 5) {
                        title = cleanedTitle;
                    }
                }
            }
            
            // 方法5: 从文章内容提取可能的标题（查找粗体或大字号的开头文本）
            if (!title) {
                // 查找可能是标题的元素（粗体、h2、h3 等）
                const possibleTitleElems = $tweetElement.find('h2, h3, strong, b').filter((i, el) => {
                    const text = $(el).text().trim();
                    return text.length > 10 && text.length < 150;
                });
                if (possibleTitleElems.length > 0) {
                    title = possibleTitleElems.first().text().trim();
                }
            }
            
            // 方法1: twitterArticleRichTextView（Article 主内容区域）
            const articleRichText = $tweetElement.find('[data-testid="twitterArticleRichTextView"]').first();
            if (articleRichText.length > 0) {
                content = articleRichText.text().trim();
            }
            
            // 方法2: longformRichTextComponent（长文章组件）
            if (!content) {
                const longformText = $tweetElement.find('[data-testid="longformRichTextComponent"]').first();
                if (longformText.length > 0) {
                    content = longformText.text().trim();
                }
            }
            
            // 方法3: public-DraftStyleDefault-block（编辑器格式）
            if (!content) {
                const draftBlocks = $tweetElement.find('div.public-DraftStyleDefault-block');
                if (draftBlocks.length > 0) {
                    const paragraphs = [];
                    draftBlocks.each((i, elem) => {
                        const text = $(elem).text().trim();
                        if (text && text.length > 0) {
                            paragraphs.push(text);
                        }
                    });
                    if (paragraphs.length > 0) {
                        content = paragraphs.join('\n\n');
                    }
                }
            }
            
            // 方法4: 备选 - 从页面主体提取最长文本
            if (!content) {
                const textElements = $tweetElement.find('div[lang] span, span, p');
                let maxLength = 0;
                let bestText = '';
                textElements.each((i, elem) => {
                    const text = $(elem).text().trim();
                    // 查找长文本（Article 内容通常较长）
                    if (text.length > maxLength && text.length > 100) {
                        if (!text.match(/^(@|#|\d+[hms]|ago|分钟前|小时前|天前)/i)) {
                            bestText = text;
                            maxLength = text.length;
                        }
                    }
                });
                if (bestText) {
                    content = bestText;
                }
            }
            
            // 最后：如果标题仍为空，从内容开头提取标题
            if (!title && content) {
                // 尝试从内容的第一句话生成标题
                const firstSentence = content.match(/^(.{10,80}?)[.。！？\n]/);
                if (firstSentence) {
                    title = firstSentence[1].trim();
                } else if (content.length > 50) {
                    // 取前50个字符作为标题
                    title = content.substring(0, 50).trim() + '...';
                }
            }
        } else {
            // Status（推文）类型：优先使用标准推文选择器
            
            // 方法1: 标准推文文本（data-testid="tweetText"）
            const tweetTextElem = $tweetElement.find('[data-testid="tweetText"]').first();
            if (tweetTextElem.length > 0) {
                content = tweetTextElem.text().trim();
            }
            
            // 方法2: 文章类型推文（Article）- 备用
            if (!content) {
                const articleRichText = $tweetElement.find('[data-testid="twitterArticleRichTextView"]').first();
                if (articleRichText.length > 0) {
                    content = articleRichText.text().trim();
                }
            }
            
            // 方法3: 长文章组件（longformRichTextComponent）
            if (!content) {
                const longformText = $tweetElement.find('[data-testid="longformRichTextComponent"]').first();
                if (longformText.length > 0) {
                    content = longformText.text().trim();
                }
            }
            
            // 方法4: 从包含 public-DraftStyleDefault-block 的 div 中提取（文章编辑器格式）
            if (!content) {
                const draftBlocks = $tweetElement.find('div.public-DraftStyleDefault-block');
                if (draftBlocks.length > 0) {
                    const paragraphs = [];
                    draftBlocks.each((i, elem) => {
                        const text = $(elem).text().trim();
                        if (text && text.length > 0) {
                            paragraphs.push(text);
                        }
                    });
                    if (paragraphs.length > 0) {
                        content = paragraphs.join('\n\n');
                    }
                }
            }
            
            // 方法5: 备选方案 - 从 article 中查找主要文本内容
            if (!content) {
                const textElements = $tweetElement.find('div[lang] span, span');
                let maxLength = 0;
                let bestText = '';
                textElements.each((i, elem) => {
                    const text = $(elem).text().trim();
                    // 查找长度适中的文本（排除太短或太长的）
                    if (text.length > maxLength && text.length > 50 && text.length < 5000) {
                        // 排除明显不是推文内容的文本（如用户名、时间等）
                        if (!text.match(/^(@|#|\d+[hms]|ago|分钟前|小时前|天前)/i)) {
                            bestText = text;
                            maxLength = text.length;
                        }
                    }
                });
                if (bestText) {
                    content = bestText;
                }
            }
        }
        
        // 提取发布时间
        let publishTime = '';
        const timeElem = $tweetElement.find('time').first();
        if (timeElem.length > 0) {
            publishTime = timeElem.attr('datetime') || timeElem.text().trim();
        } else {
            // 备选方案：查找包含时间格式的文本
            $tweetElement.find('span').each((i, elem) => {
                const text = $(elem).text().trim();
                // 匹配时间格式：如 "Dec 20, 2024" 或 "2h" 或 "2 hours ago"
                if (/^\d+[hms]/.test(text) || /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) || /ago/.test(text.toLowerCase())) {
                    publishTime = text;
                    return false;
                }
            });
        }
        
        // 提取图片
        const imageUrls = [];
        const seenUrls = new Set();
        
        // 方法1: 从 img 标签的 src 属性提取
        $tweetElement.find('img').each((i, elem) => {
            const $img = $(elem);
            // 检查多个可能的属性
            let src = $img.attr('src') || 
                     $img.attr('data-src') || 
                     $img.attr('data-lazy-src') || 
                     $img.attr('data-original') || '';
            
            if (src && src.includes('pbs.twimg.com/media')) {
                // 过滤掉头像图片和视频缩略图
                if (!src.includes('profile_images') && 
                    !src.includes('avatar') && 
                    !src.includes('ext_tw_video_thumb')) {
                    
                    // 标准化图片 URL，确保获取原始尺寸
                    // URL 格式: https://pbs.twimg.com/media/{id}?format={format}&name={size}
                    // 我们移除 name 参数，然后添加 name=orig 以获取原始尺寸
                    let cleanSrc = src;
                    
                    try {
                        // 如果 URL 包含查询参数，处理参数
                        if (cleanSrc.includes('?')) {
                            const urlObj = new URL(cleanSrc);
                            // 移除 name 参数（尺寸参数）
                            urlObj.searchParams.delete('name');
                            // 确保有 format 参数，如果没有则添加默认值
                            if (!urlObj.searchParams.has('format')) {
                                urlObj.searchParams.set('format', 'jpg');
                            }
                            // 添加 name=orig 以获取原始尺寸
                            urlObj.searchParams.set('name', 'orig');
                            cleanSrc = urlObj.toString();
                        } else {
                            // 如果 URL 没有查询参数，添加 format 和 name 参数
                            cleanSrc = cleanSrc + '?format=jpg&name=orig';
                        }
                    } catch (error) {
                        // 如果 URL 解析失败，尝试简单处理
                        console.warn(`解析图片 URL 失败: ${src}, 错误: ${error.message}`);
                        // 如果 URL 不完整，尝试添加参数
                        if (!cleanSrc.includes('?')) {
                            cleanSrc = cleanSrc + '?format=jpg&name=orig';
                        }
                    }
                    
                    if (!seenUrls.has(cleanSrc)) {
                        seenUrls.add(cleanSrc);
                        imageUrls.push(cleanSrc);
                    }
                }
            }
        });
        
        // 方法2: 从 video 标签的 poster 属性提取（视频封面图）
        $tweetElement.find('video[poster*="pbs.twimg.com/media"]').each((i, elem) => {
            const poster = $(elem).attr('poster') || '';
            if (poster && !seenUrls.has(poster)) {
                seenUrls.add(poster);
                imageUrls.push(poster);
            }
        });
        
        // 提取视频
        const videoUrls = [];
        const seenVideoUrls = new Set();
        
        // 方法1: 从 video 标签的 source 子元素提取
        $tweetElement.find('video source').each((i, elem) => {
            const src = $(elem).attr('src') || 
                       $(elem).attr('data-src') || 
                       $(elem).attr('data-media-url') || '';
            if (src && !src.startsWith('blob:') && !seenVideoUrls.has(src)) {
                seenVideoUrls.add(src);
                videoUrls.push(src);
            }
        });
        
        // 方法2: 从 video 标签的 src 属性提取
        $tweetElement.find('video[src]').each((i, elem) => {
            const src = $(elem).attr('src') || 
                       $(elem).attr('data-src') || 
                       $(elem).attr('data-media-url') || '';
            if (src && !src.startsWith('blob:') && !seenVideoUrls.has(src)) {
                seenVideoUrls.add(src);
                videoUrls.push(src);
            }
        });
        
        // 方法3: 从 video 标签的其他数据属性提取
        $tweetElement.find('video').each((i, elem) => {
            const $video = $(elem);
            // 检查多个可能的属性
            const possibleAttrs = ['data-video-url', 'data-media-url', 'data-src', 'src'];
            for (const attr of possibleAttrs) {
                const src = $video.attr(attr) || '';
                if (src && !src.startsWith('blob:') && 
                    (src.includes('video.twimg.com') || src.includes('pbs.twimg.com') || src.startsWith('http'))) {
                    if (!seenVideoUrls.has(src)) {
                        seenVideoUrls.add(src);
                        videoUrls.push(src);
                    }
                    break; // 找到一个就停止
                }
            }
        });
        
        // 方法4: 从页面中的 script 标签提取视频 URL（X.com 可能在 JSON 数据中存储视频 URL）
        if (videoUrls.length === 0) {
            try {
                // 查找包含视频信息的 script 标签
                const scripts = this.$('script');
                scripts.each((i, elem) => {
                    const scriptContent = $(elem).html() || '';
                    if (scriptContent && scriptContent.includes('video')) {
                        // 尝试匹配 video.twimg.com 的 URL
                        const videoUrlMatches = scriptContent.match(/https?:\/\/video\.twimg\.com\/[^\s"']+/g);
                        if (videoUrlMatches) {
                            videoUrlMatches.forEach(url => {
                                if (!seenVideoUrls.has(url)) {
                                    seenVideoUrls.add(url);
                                    videoUrls.push(url);
                                }
                            });
                        }
                        
                        // 尝试匹配 pbs.twimg.com/ext_tw_video 的 URL
                        const pbsVideoMatches = scriptContent.match(/https?:\/\/pbs\.twimg\.com\/ext_tw_video[^\s"']+/g);
                        if (pbsVideoMatches) {
                            pbsVideoMatches.forEach(url => {
                                if (!seenVideoUrls.has(url)) {
                                    seenVideoUrls.add(url);
                                    videoUrls.push(url);
                                }
                            });
                        }
                    }
                });
            } catch (error) {
                console.warn(`从 script 标签提取视频 URL 失败: ${error.message}`);
            }
        }
        
        // 提取互动数据
        let likeCount = '0';
        let retweetCount = '0';
        let replyCount = '0';
        let viewCount = '0';
        
        /**
         * 解析带缩写的数字（如 19万、3.5K、1.1亿、110M 等）
         * @param {string} text 包含数字的文本
         * @returns {string} 解析后的数字字符串
         */
        const parseAbbreviatedNumber = (text) => {
            if (!text) return '0';
            text = text.trim();
            
            // 移除逗号
            text = text.replace(/,/g, '');
            
            // 匹配数字和单位（支持中文和英文单位）
            // 格式: 数字 + 可选单位 (K/M/B/万/亿)
            const match = text.match(/([\d.]+)\s*([KMBkmb万亿])?/i);
            if (!match) return '0';
            
            let num = parseFloat(match[1]);
            const unit = match[2];
            
            if (unit) {
                switch (unit.toUpperCase()) {
                    case 'K':
                    case '千':
                        num *= 1000;
                        break;
                    case 'M':
                    case '万':
                        num *= 10000;
                        break;
                    case 'B':
                    case '亿':
                        num *= 100000000;
                        break;
                }
            }
            
            return Math.round(num).toString();
        };
        
        // 点赞数
        const likeButton = $tweetElement.find('[data-testid="like"]').first();
        if (likeButton.length > 0) {
            const likeText = likeButton.text().trim();
            likeCount = parseAbbreviatedNumber(likeText);
        }
        
        // 转发数
        const retweetButton = $tweetElement.find('[data-testid="retweet"]').first();
        if (retweetButton.length > 0) {
            const retweetText = retweetButton.text().trim();
            retweetCount = parseAbbreviatedNumber(retweetText);
        }
        
        // 回复数
        const replyButton = $tweetElement.find('[data-testid="reply"]').first();
        if (replyButton.length > 0) {
            const replyText = replyButton.text().trim();
            replyCount = parseAbbreviatedNumber(replyText);
        }
        
        // 查看数（如果可用）- 多种方法尝试
        // 注意：X.com Article 页面的阅读量显示方式可能不同
        
        // 方法1: 从 aria-label 包含 view 的元素提取
        const viewElements = $tweetElement.find('[aria-label*="view" i], [aria-label*="View"]');
        viewElements.each((i, elem) => {
            const ariaLabel = $(elem).attr('aria-label') || '';
            // 匹配如 "110M views" 或 "1.1亿 views"
            const match = ariaLabel.match(/([\d.,]+[KMBkmb万亿]?)\s*view/i);
            if (match && viewCount === '0') {
                viewCount = parseAbbreviatedNumber(match[1]);
            }
        });
        
        // 方法2: 从页面中查找包含 "views" 或 "次浏览" 的文本
        if (viewCount === '0') {
            const viewPatterns = /([\d.,]+[KMBkmb万亿]?)\s*(views?|次浏览|次查看|浏览)/i;
            // 优先在底部操作栏区域查找
            $tweetElement.find('span, a').each((i, elem) => {
                const text = $(elem).text().trim();
                // 排除已经匹配的评论数
                if (text === replyCount) return;
                const match = text.match(viewPatterns);
                if (match) {
                    const parsed = parseAbbreviatedNumber(match[1]);
                    // 阅读量通常比评论数大很多
                    if (parseInt(parsed) > parseInt(replyCount) * 10) {
                        viewCount = parsed;
                        return false;
                    }
                }
            });
        }
        
        // 方法3: app-text-transition-container（但要排除已匹配的数值）
        if (viewCount === '0') {
            $tweetElement.find('[data-testid="app-text-transition-container"]').each((i, elem) => {
                const viewText = $(elem).text().trim();
                const parsed = parseAbbreviatedNumber(viewText);
                // 确保不是已经提取的其他数据
                if (parsed !== '0' && parsed !== likeCount && parsed !== retweetCount && parsed !== replyCount) {
                    viewCount = parsed;
                    return false;
                }
            });
        }
        
        // 提取引用推文
        let quotedTweet = null;
        const quotedTweetElem = $tweetElement.find('[data-testid="tweet"]').not($tweetElement).first();
        if (quotedTweetElem.length > 0) {
            quotedTweet = this.extractXComTweetFromElement(quotedTweetElem);
        }
        
        // 提取评论（可选）
        const comments = this.extractXComComments($tweetElement);
        
        return {
            title,  // Article 类型有标题，Status 类型为空字符串
            content,
            author_name: authorName,
            author_username: authorUsername,
            author_id: authorId,
            author_avatar: authorAvatar,
            publish_time: publishTime,
            like_count: likeCount,
            retweet_count: retweetCount,
            reply_count: replyCount,
            view_count: viewCount,
            image_urls: imageUrls,
            video_urls: videoUrls,
            media_count: imageUrls.length + videoUrls.length,
            quoted_tweet: quotedTweet,
            comments,
            source_url: this.url
        };
    }

    /**
     * 提取 X.com 评论列表
     * @param {Object} $tweetElement jQuery 推文元素（可选，用于限定搜索范围）
     * @returns {Array} 评论数组
     */
    extractXComComments($tweetElement = null) {
        const $ = this.$;
        const comments = [];
        
        // 确定搜索范围
        const searchScope = $tweetElement || $('body');
        
        // 查找所有评论推文（排除主推文）
        const commentTweets = searchScope.find('[data-testid="tweet"]');
        
        // 如果提供了主推文元素，排除它
        if ($tweetElement && $tweetElement.length > 0) {
            commentTweets.not($tweetElement);
        }
        
        // 提取每个评论
        commentTweets.each((i, elem) => {
            const $comment = $(elem);
            const commentData = this.extractXComTweetFromElement($comment);
            
            // 只添加有内容的评论
            if (commentData.content || commentData.author_name) {
                comments.push({
                    author_name: commentData.author_name,
                    author_username: commentData.author_username,
                    author_id: commentData.author_id,
                    author_avatar: commentData.author_avatar,
                    content: commentData.content,
                    publish_time: commentData.publish_time,
                    like_count: commentData.like_count,
                    retweet_count: commentData.retweet_count,
                    reply_count: commentData.reply_count
                });
            }
        });
        
        return comments;
    }

    /**
     * 提取 Reddit 帖子内容
     * 使用 Reddit 的 Web Component 属性进行提取（shreddit-post 等）
     * 这是最稳定的选择器策略，因为这些属性是 Reddit 应用程序的核心数据
     */
    extractRedditContent() {
        const $ = this.$;
        
        // 方法1：优先从 shreddit-post Web Component 的属性中提取（最稳定）
        const shredditPost = $('shreddit-post').first();
        
        let title = '';
        let content = '';
        let authorName = '';
        let authorId = '';
        let publishTime = '';
        let upvoteCount = '0';
        let commentCount = '0';
        let subredditName = '';
        let subredditUrl = '';
        
        if (shredditPost.length > 0) {
            // 从 shreddit-post 属性中提取数据
            title = shredditPost.attr('post-title') || '';
            upvoteCount = shredditPost.attr('score') || '0';
            commentCount = shredditPost.attr('comment-count') || '0';
            publishTime = shredditPost.attr('created-timestamp') || '';
            
            // 提取子版块信息
            const subredditPrefixed = shredditPost.attr('subreddit-prefixed-name') || '';
            const subredditMatch = subredditPrefixed.match(/r\/([\w]+)/);
            if (subredditMatch) {
                subredditName = subredditMatch[1];
                subredditUrl = `https://www.reddit.com/r/${subredditName}`;
            }
            
            // 从 shreddit-post-overflow-menu 提取作者信息
            const overflowMenu = $('shreddit-post-overflow-menu').first();
            if (overflowMenu.length > 0) {
                authorName = overflowMenu.attr('author-name') || '';
                authorId = overflowMenu.attr('author-id') || '';
            }
            
            // 如果 overflow-menu 没有作者信息，从 shreddit-post 属性获取
            if (!authorName) {
                // 尝试从 URL 中提取作者 ID
                const permalink = shredditPost.attr('permalink') || '';
                // 或者从页面内容中查找
                const authorLink = shredditPost.find('a[href^="/user/"]').first();
                if (authorLink.length > 0) {
                    const href = authorLink.attr('href') || '';
                    const match = href.match(/\/user\/([\w-]+)/);
                    if (match) {
                        authorId = match[1];
                        authorName = authorId;
                    }
                }
            }
        }
        
        // 提取帖子正文内容 - 从 shreddit-post-text-body 或 div[data-post-click-location="text-body"]
        const textBody = $('shreddit-post-text-body').first();
        if (textBody.length > 0) {
            // 提取文本内容，排除脚本和样式
            const textContainer = textBody.find('div[data-post-click-location="text-body"]').first();
            if (textContainer.length > 0) {
                content = textContainer.text().trim();
            } else {
                content = textBody.text().trim();
            }
        }
        
        // 如果 shreddit-post 方法失败，使用备选方法
        if (!title) {
            // 从 meta 标签提取标题
            const titleMeta = $('meta[property="og:title"]');
            if (titleMeta.length > 0) {
                title = titleMeta.attr('content') || '';
            } else {
                // 从 h1 标签提取
                const h1Title = $('h1').first();
                if (h1Title.length > 0) {
                    title = h1Title.text().trim();
                }
            }
        }
        
        // 提取图片
        const imageUrls = [];
        const seenUrls = new Set();
        
        // 从帖子内容区域查找图片
        $('shreddit-post img, [slot="post-media-container"] img').each((i, elem) => {
            const $img = $(elem);
            const src = $img.attr('src') || $img.attr('data-src') || '';
            // 过滤掉头像、图标等非内容图片
            if (src && 
                !src.includes('avatar') && 
                !src.includes('icon') &&
                !src.includes('logo') &&
                !src.includes('redditstatic.com/avatars') &&
                !src.includes('emoji') &&
                (src.includes('i.redd.it') || src.includes('preview.redd.it') || src.includes('external-preview'))) {
                // 去重
                if (!seenUrls.has(src)) {
                    seenUrls.add(src);
                    imageUrls.push(src);
                }
            }
        });
        
        // 提取评论
        const comments = this.extractRedditComments();
        
        return {
            title,
            content,
            author_name: authorName,
            author_id: authorId,
            publish_time: publishTime,
            upvote_count: upvoteCount,
            comment_count: commentCount,
            subreddit_name: subredditName,
            subreddit_url: subredditUrl,
            image_urls: imageUrls,
            comments,
            source_url: this.url
        };
    }

    /**
     * 提取 Reddit 评论列表
     * 使用 shreddit-comment Web Component 的属性提取评论数据
     * @returns {Array} 评论数组
     */
    extractRedditComments() {
        const $ = this.$;
        const comments = [];
        
        // 只提取顶级评论（depth="0"）
        // 嵌套评论通过递归提取
        const topLevelComments = $('shreddit-comment[depth="0"]');
        
        topLevelComments.each((i, elem) => {
            const comment = this.extractSingleRedditComment($(elem));
            if (comment && (comment.content || comment.author_name)) {
                comments.push(comment);
            }
        });
        
        return comments;
    }

    /**
     * 提取单条 Reddit 评论
     * 从 shreddit-comment Web Component 的属性中提取数据
     * @param {Object} $comment jQuery 评论元素
     * @returns {Object} 评论对象
     */
    extractSingleRedditComment($comment) {
        const $ = this.$;
        
        // 从 shreddit-comment 属性中提取数据
        const authorName = $comment.attr('author') || '';
        const thingId = $comment.attr('thingid') || '';
        const score = $comment.attr('score') || '0';
        const depth = parseInt($comment.attr('depth') || '0', 10);
        const permalink = $comment.attr('permalink') || '';
        
        // 提取评论内容 - 从评论内部的文本区域
        let content = '';
        
        // 查找评论内容区域
        // Reddit 评论内容通常在 div[id^="t1_"] 内的段落中
        const contentContainer = $comment.find('div[slot="comment-content"], div[data-post-click-location="text-body"]').first();
        if (contentContainer.length > 0) {
            content = contentContainer.text().trim();
        } else {
            // 备选：查找段落元素
            const paragraphs = $comment.find('p');
            if (paragraphs.length > 0) {
                const texts = [];
                paragraphs.each((i, p) => {
                    const text = $(p).text().trim();
                    if (text) {
                        texts.push(text);
                    }
                });
                content = texts.join('\n');
            }
        }
        
        // 如果还是没有内容，尝试从整个评论中提取（排除子评论）
        if (!content) {
            // 克隆评论元素，移除嵌套的评论
            const $clone = $comment.clone();
            $clone.find('shreddit-comment').remove();
            $clone.find('shreddit-comment-action-row').remove();
            $clone.find('[slot="actionRow"]').remove();
            
            // 查找可能包含内容的区域
            const textContent = $clone.find('div').filter((i, el) => {
                const text = $(el).text().trim();
                return text.length > 10 && !text.includes('Reply') && !text.includes('Share');
            }).first().text().trim();
            
            if (textContent) {
                content = textContent;
            }
        }
        
        // 提取时间
        let time = '';
        const timeElem = $comment.find('time, faceplate-timeago').first();
        if (timeElem.length > 0) {
            time = timeElem.attr('datetime') || timeElem.attr('ts') || timeElem.text().trim();
        }
        
        // 提取嵌套回复（只提取直接子评论）
        const replies = [];
        const currentDepth = depth;
        const directReplies = $comment.find(`shreddit-comment[depth="${currentDepth + 1}"]`);
        
        directReplies.each((i, replyElem) => {
            const reply = this.extractSingleRedditComment($(replyElem));
            if (reply && (reply.content || reply.author_name)) {
                replies.push(reply);
            }
        });
        
        return {
            author_name: authorName,
            comment_id: thingId,
            content,
            score: score,
            depth: depth,
            permalink: permalink ? `https://www.reddit.com${permalink}` : '',
            time,
            replies
        };
    }

    async fetchXhsComments(xhsUrl, maxPages = 0) {
        /**
         * 获取小红书评论信息
         * @param {string} xhsUrl 小红书笔记URL
         * @param {number} maxPages 最多抓取的评论页数，默认为0（不抓取评论）
         */
        // 从xhs_url中提取note_id
        const noteId = xhsUrl.split('/').pop().split('?')[0];
        
        // 从xhs_url中提取xsec_token
        const url = new URL(xhsUrl);
        const xsecToken = url.searchParams.get('xsec_token') || '';
        
        console.log(`提取到的note_id: ${noteId}`);
        console.log(`提取到的xsec_token: ${xsecToken}`);
        console.log(`最多抓取评论页数: ${maxPages}`);
        
        // 如果 maxPages 为 0，直接返回空结果，不进行任何API请求
        if (maxPages === 0) {
            console.log('maxPages 为 0，跳过评论抓取');
            return {
                comments: [],
                totalCount: 0
            };
        }
        
        let cursor = "";
        const apiUrlTemplate = 'https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id={note_id}&cursor={cursor}&top_comment_id=&image_formats=jpg,webp,avif&xsec_token={xsec_token}';

        // 获取小红书规则的headers
        let xiaohongshuRule = null;
        for (const rule of this.urlRules) {
            if (rule.name === "xiaohongshu") {
                xiaohongshuRule = rule;
                break;
            }
        }
        
        let headers;
        if (xiaohongshuRule) {
            // 完全使用当前小红书的headers，不进行任何修改
            headers = xiaohongshuRule.headers;
        } else {
            console.log("未找到小红书规则，使用默认headers");
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
            };
        }

        try {
            let hasMore = true;
            let totalCommentsCount = 0;
            let allComments = [];
            // 使用传入的 maxPages 参数，默认为1，无上限限制
            const maxIterations = Math.max(1, maxPages); // 至少1页，无上限

            let iteration = 0;
            while (hasMore && iteration < maxIterations) {
                const apiUrl = apiUrlTemplate
                    .replace('{note_id}', noteId)
                    .replace('{cursor}', cursor)
                    .replace('{xsec_token}', xsecToken);
                
                console.log(`正在请求评论API (第${iteration + 1}页): ${apiUrl}`);
                
                // 发送HTTP请求获取网页内容
                const response = await fetch(apiUrl, {
                    headers,
                    signal: AbortSignal.timeout(10000)
                });
                
                console.log(`响应状态码: ${response.status}`);
                
                const responseData = await response.json();
                const responseText = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
                console.log(`响应内容前500字符: ${responseText.substring(0, 500)}`);
                
                // 提取评论
                let commentList;
                try {
                    commentList = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
                } catch (jsonError) {
                    console.error(`JSON解析失败: ${jsonError.message}`);
                    console.error(`响应内容: ${responseText}`);
                    break;
                }
                
                // 检查响应结构
                if (!commentList.data) {
                    console.error(`响应中没有data字段: ${JSON.stringify(commentList)}`);
                    break;
                }
                
                const data = commentList.data;
                const comments = data.comments || [];
                
                console.log(`本次获取到 ${comments.length} 条评论`);
                
                // 累加评论数
                totalCommentsCount += comments.length;
                
                // 将评论添加到总的评论列表中
                allComments = allComments.concat(comments);
                
                // 检查是否有更多评论
                hasMore = data.has_more || false;
                cursor = data.cursor || "";
                
                console.log(`has_more: ${hasMore}, cursor: ${cursor}`);
                
                iteration++;
            }

            console.log(`总共获取到 ${totalCommentsCount} 条评论`);
            return {
                comments: allComments,
                totalCount: totalCommentsCount
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`请求失败: 超时 - ${error.message}`);
            } else {
                console.error(`请求失败: ${error.message}`);
            }
            return {
                comments: [],
                totalCount: 0
            };
        }
    }

    extractGeneralContent() {
        const $ = this.$;
        
        // 尝试多种方式提取标题
        let title = '';
        
        // 方法1：尝试 og:title meta 标签
        const ogTitleMeta = $('meta[property="og:title"]');
        if (ogTitleMeta.length && ogTitleMeta.attr('content')) {
            title = ogTitleMeta.attr('content').trim();
        }
        
        // 方法2：尝试 name="og:title" meta 标签（某些网站使用 name 而不是 property）
        if (!title) {
            const ogTitleMetaName = $('meta[name="og:title"]');
            if (ogTitleMetaName.length && ogTitleMetaName.attr('content')) {
                title = ogTitleMetaName.attr('content').trim();
            }
        }
        
        // 方法3：尝试 title 标签（最基本的HTML标题提取）
        if (!title) {
            const titleTag = $('title');
            if (titleTag.length) {
                const titleText = titleTag.text().trim();
                if (titleText) {
                    title = titleText;
                }
            }
        }
        
        // 方法4：尝试 h1 标签作为备选
        if (!title) {
            const h1Tag = $('h1').first();
            if (h1Tag.length) {
                const h1Text = h1Tag.text().trim();
                if (h1Text) {
                    title = h1Text;
                }
            }
        }
        
        // 方法5：尝试 itemprop="name" meta 标签
        if (!title) {
            const nameMeta = $('meta[itemprop="name"]');
            if (nameMeta.length && nameMeta.attr('content')) {
                title = nameMeta.attr('content').trim();
            }
        }
        
        // 方法6：如果所有HTML方法都失败，尝试从原始内容中提取Markdown格式的标题
        // 某些网站（如文档站点）可能直接返回Markdown而不是HTML
        if (!title && this.content) {
            // 匹配 Markdown 格式的标题：以 # 开头，后面跟空格和标题文本（第一级标题）
            const markdownTitleMatch = this.content.match(/^#\s+(.+)$/m);
            if (markdownTitleMatch && markdownTitleMatch[1]) {
                title = markdownTitleMatch[1].trim();
            }
        }
        
        // 如果所有方法都失败，使用空字符串
        if (!title) {
            title = '';
        }
        
        const content = $.text();
        return { title, content, source_url: this.url };
    }

    async loadContentFromFile(filePath, parser = 'html.parser') {
        try {
            this.content = await fs.readFile(filePath, 'utf-8');
            this.$ = cheerio.load(this.content);
            console.log(`成功加载文件内容并使用解析器 '${parser}' 解析。`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`文件未找到: ${filePath}`);
            } else {
                console.error(`加载文件时出错: ${error.message}`);
            }
        }
    }

    async testExtractionFromFile(filePath, parser = 'html.parser') {
        await this.loadContentFromFile(filePath, parser);
        if (this.$) {
            const rule = this.detectUrlType();
            if (rule) {
                const extractorMethodName = rule.extractor;
                const extractorMethod = this[extractorMethodName];
                if (extractorMethod) {
                    return await extractorMethod.call(this);
                } else {
                    console.log(`未找到提取器方法: ${extractorMethodName}`);
                }
            } else {
                console.log('未能检测到匹配的URL规则。');
            }
        }
        return {};
    }

    async testExtractionFromContent(htmlContent, parser = 'html.parser') {
        try {
            this.content = htmlContent;
            this.$ = cheerio.load(this.content);
            console.log(`成功加载 HTML 内容并使用解析器 '${parser}' 解析。`);
            
            const rule = this.detectUrlType();
            if (rule) {
                const extractorMethodName = rule.extractor;
                const extractorMethod = this[extractorMethodName];
                if (extractorMethod) {
                    return await extractorMethod.call(this);
                } else {
                    console.log(`未找到提取器方法: ${extractorMethodName}`);
                }
            } else {
                console.log('未能检测到匹配的 URL 规则。');
            }
        } catch (error) {
            console.error(`提取内容时出错: ${error.message}`);
        }
        
        return {};
    }

    async scrapeFromHtml(htmlContent) {
        try {
            this.content = htmlContent;
            await this.parseContent();
            const extractedData = await this.extractContent();
            return { error: '0', data: extractedData };
        } catch (error) {
            return { 
                error: '1', 
                detail: error.message || 'Failed to extract content from HTML'
            };
        }
    }

    async scrape() {
        try {
            await this.fetchContent();
            if (this.content) {
                await this.parseContent();
                const extractedData = await this.extractContent();
                return { error: '0', data: extractedData };
            } else {
                return { error: '1', detail: 'Failed to fetch content' };
            }
        } catch (error) {
            return { 
                error: '1', 
                detail: error.message || 'Failed to fetch content',
                statusCode: error.response?.status,
                statusText: error.response?.statusText
            };
        }
    }
}

export default WebScraper; 
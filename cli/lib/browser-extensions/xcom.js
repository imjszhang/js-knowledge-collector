/**
 * X.com (Twitter) 专用抓取扩展
 * 
 * 处理 X.com 的特殊需求：
 * - Article 类型：滚动加载完整内容
 * - Status 类型：视频检测和提取（多种方法）
 */

import BaseScrapeExtension from './common.js';

class XComScrapeExtension extends BaseScrapeExtension {
  constructor(browser) {
    super(browser);
  }

  get name() {
    return 'x_com';
  }

  /**
   * 检测 URL 类型
   * @param {string} url 
   * @returns {Object} { isArticle: boolean, isStatus: boolean, tweetId: string|null }
   */
  parseUrl(url) {
    const isArticle = url.includes('/article/');
    const isStatus = url.includes('/status/');
    const tweetIdMatch = url.match(/status\/(\d+)/);
    const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;
    
    return { isArticle, isStatus, tweetId };
  }

  /**
   * 获取内容等待配置
   */
  getContentWaitConfig(url) {
    return {
      selector: '[data-testid="twitterArticleRichTextView"], [data-testid="tweetText"], .public-DraftStyleDefault-block, [data-testid="longformRichTextComponent"]',
      minContentLength: 50,
      timeout: 15000
    };
  }

  /**
   * 准备阶段：滚动加载（Article）或触发视频播放（Status）
   */
  async prepare(tabId, url) {
    const { isArticle, isStatus } = this.parseUrl(url);
    
    // Article 类型：执行滚动加载
    if (isArticle) {
      this.logger.info('[x_com] 检测到 Article 类型，执行滚动加载...');
      await this.scrollPage(tabId, { steps: 10, delay: 300, scrollBack: true });
      this.logger.info('[x_com] ✓ 滚动加载完成');
    }
    
    // Status 类型：检测并触发视频播放
    if (isStatus) {
      const hasVideos = await this._detectAndTriggerVideos(tabId, url);
      if (hasVideos) {
        // 等待视频资源加载
        await this.wait(2000);
      }
    }
  }

  /**
   * 提取额外数据：视频 URL
   */
  async extractExtra(tabId, html, url) {
    const { isArticle, isStatus, tweetId } = this.parseUrl(url);
    
    // Article 类型通常没有视频
    if (isArticle) {
      this.logger.info('[x_com] Article 类型，跳过视频提取');
      return {};
    }
    
    // Status 类型：提取视频
    if (isStatus && tweetId) {
      const videoUrls = await this._extractVideoUrls(tabId, tweetId);
      
      if (videoUrls.length > 0) {
        this.logger.info(`[x_com] ✓ 提取到 ${videoUrls.length} 个视频 URL`);
        return { video_urls: videoUrls };
      }
    }
    
    return {};
  }

  /**
   * 检测视频元素并触发播放（单次API调用，检测+触发合并）
   * @private
   */
  async _detectAndTriggerVideos(tabId, url) {
    const { tweetId } = this.parseUrl(url);
    
    try {
      this.logger.info('[x_com] 正在检测并触发页面中的视频元素...');
      
      // 合并检测和触发为单次 executeScript 调用，减少API请求
      const detectAndTriggerScript = `
        (() => {
          const tweetId = '${tweetId || ''}';
          let mainTweetContainer = null;
          
          if (tweetId) {
            const articleElements = document.querySelectorAll('article[data-testid="tweet"]');
            for (const article of articleElements) {
              const articleHtml = article.innerHTML || '';
              if (articleHtml.includes(tweetId) || 
                  article.querySelector('a[href*="/status/' + tweetId + '"]')) {
                mainTweetContainer = article;
                break;
              }
            }
          }
          
          const videoElements = mainTweetContainer 
            ? mainTweetContainer.querySelectorAll('video')
            : document.querySelectorAll('video');
          
          let mainTweetVideos = 0;
          videoElements.forEach(video => {
            if (mainTweetContainer) {
              const isInMainTweet = mainTweetContainer.contains(video);
              const isInQuotedTweet = video.closest('[data-testid="tweet"]') !== mainTweetContainer;
              if (isInMainTweet && !isInQuotedTweet) {
                mainTweetVideos++;
              }
            } else {
              mainTweetVideos++;
            }
          });
          
          // 如果检测到视频，立即触发播放
          if (mainTweetVideos > 0) {
            videoElements.forEach(video => {
              try {
                video.click();
                video.play().catch(() => {});
              } catch (e) {}
            });
          }
          
          return mainTweetVideos;
        })();
      `;
      
      // 视频检测超时 15 秒，避免在异常页面卡住
      const videoCount = await Promise.race([
        this.executeScript(tabId, detectAndTriggerScript),
        this.wait(15000).then(() => null)
      ]);
      
      if (videoCount > 0) {
        this.logger.info(`[x_com] ✓ 检测到 ${videoCount} 个视频元素，已触发播放`);
        return true;
      } else {
        this.logger.info('[x_com] 未检测到视频元素');
        return false;
      }
    } catch (error) {
      this.logger.warn(`[x_com] 检测视频元素失败: ${error.message}`);
      return true; // 检测失败时继续尝试提取
    }
  }

  /**
   * 提取视频 URL（多种方法）
   * @private
   */
  async _extractVideoUrls(tabId, tweetId) {
    let videoUrls = [];
    
    // 方法1: 从视频元素和页面数据提取
    videoUrls = await this._extractFromDOMAndScripts(tabId, tweetId);
    
    // 方法2: 从 Performance API 提取（如果方法1没有结果）
    if (videoUrls.length === 0) {
      const resourceUrls = await this._extractFromPerformanceAPI(tabId);
      videoUrls = resourceUrls;
    }
    
    // 方法3: 通过 GraphQL API 提取（如果前面方法都没有结果）
    if (videoUrls.length === 0) {
      const apiUrls = await this._extractFromGraphQLAPI(tabId, tweetId);
      videoUrls = apiUrls;
    }
    
    return videoUrls;
  }

  /**
   * 方法1: 从 DOM 和脚本标签提取视频 URL
   * @private
   */
  async _extractFromDOMAndScripts(tabId, tweetId) {
    try {
      this.logger.info('[x_com] 正在从 DOM 和脚本提取视频 URL...');
      
      const videoScript = `
        (() => {
          const videos = [];
          const tweetId = '${tweetId || ''}';
          
          // 找到主推文容器
          let mainTweetContainer = null;
          if (tweetId) {
            const articleElements = document.querySelectorAll('article[data-testid="tweet"]');
            for (const article of articleElements) {
              const articleHtml = article.innerHTML || '';
              if (articleHtml.includes(tweetId) || 
                  article.querySelector('a[href*="/status/' + tweetId + '"]')) {
                mainTweetContainer = article;
                break;
              }
            }
          }
          
          // 从视频元素提取
          const videoElements = mainTweetContainer 
            ? mainTweetContainer.querySelectorAll('video')
            : document.querySelectorAll('video');
          
          videoElements.forEach((video) => {
            if (mainTweetContainer) {
              const isInMainTweet = mainTweetContainer.contains(video);
              const isInQuotedTweet = video.closest('[data-testid="tweet"]') !== mainTweetContainer;
              if (!isInMainTweet || isInQuotedTweet) return;
            }
            
            // 检查 source 子元素
            video.querySelectorAll('source').forEach(source => {
              const src = source.src || source.getAttribute('data-src');
              if (src && !src.startsWith('blob:') && 
                  (src.includes('video.twimg.com') || src.includes('pbs.twimg.com') || src.startsWith('http'))) {
                if (tweetId && src.includes(tweetId)) {
                  videos.unshift(src);
                } else {
                  videos.push(src);
                }
              }
            });
            
            // 检查 video 标签属性
            const videoSrc = video.src || video.getAttribute('data-src') || video.getAttribute('data-video-url');
            if (videoSrc && !videoSrc.startsWith('blob:') && 
                (videoSrc.includes('video.twimg.com') || videoSrc.includes('pbs.twimg.com') || videoSrc.startsWith('http'))) {
              if (tweetId && videoSrc.includes(tweetId)) {
                videos.unshift(videoSrc);
              } else {
                videos.push(videoSrc);
              }
            }
          });
          
          // 从 __INITIAL_STATE__ 提取
          try {
            if (window.__INITIAL_STATE__) {
              const stateStr = JSON.stringify(window.__INITIAL_STATE__);
              const videoUrlMatches = stateStr.match(/https?:\\/\\/video\\.twimg\\.com\\/[^"\\s]+/g);
              if (videoUrlMatches) {
                videos.push(...videoUrlMatches);
              }
            }
          } catch (e) {}
          
          // 从 script 标签提取
          try {
            document.querySelectorAll('script').forEach(script => {
              const content = script.textContent || script.innerHTML || '';
              if (content.includes('video.twimg.com')) {
                const matches = content.match(/https?:\\/\\/video\\.twimg\\.com\\/[^"\\s']+/g);
                if (matches) {
                  videos.push(...matches);
                }
              }
            });
          } catch (e) {}
          
          return [...new Set(videos)];
        })();
      `;
      
      const urls = await Promise.race([
        this.executeScript(tabId, videoScript),
        this.wait(15000).then(() => [])
      ]);
      
      if (urls && urls.length > 0) {
        this.logger.info(`[x_com] ✓ 从 DOM/脚本提取到 ${urls.length} 个视频 URL`);
      }
      
      return Array.isArray(urls) ? urls : [];
    } catch (error) {
      this.logger.warn(`[x_com] DOM/脚本提取失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 方法2: 从 Performance API 提取视频 URL
   * @private
   */
  async _extractFromPerformanceAPI(tabId) {
    try {
      this.logger.info('[x_com] 正在从 Performance API 提取视频 URL...');
      
      const resourceScript = `
        (() => {
          const videos = [];
          if (window.performance && window.performance.getEntriesByType) {
            const resources = window.performance.getEntriesByType('resource');
            resources.forEach(resource => {
              const url = resource.name || '';
              if (url.includes('video.twimg.com') && 
                  (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.m4s'))) {
                videos.push(url);
              }
            });
          }
          return videos;
        })();
      `;
      
      const resourceUrls = await Promise.race([
        this.executeScript(tabId, resourceScript),
        this.wait(10000).then(() => [])
      ]);
      
      if (resourceUrls && resourceUrls.length > 0) {
        // 筛选最佳质量
        const m3u8Urls = resourceUrls.filter(url => 
          url.includes('.m3u8') && !url.includes('avc1') && !url.includes('mp4a'));
        const mp4Urls = resourceUrls.filter(url => 
          url.includes('.mp4') && (url.includes('1080') || url.includes('720')));
        const allMp4Urls = resourceUrls.filter(url => url.includes('.mp4'));
        
        let selectedUrls = [...new Set([...m3u8Urls])];
        if (mp4Urls.length > 0) {
          selectedUrls = [...new Set([...selectedUrls, ...mp4Urls])];
        } else if (allMp4Urls.length > 0) {
          selectedUrls = [...new Set([...selectedUrls, ...allMp4Urls])];
        }
        
        if (selectedUrls.length > 0) {
          this.logger.info(`[x_com] ✓ 从 Performance API 提取到 ${selectedUrls.length} 个视频 URL`);
          return selectedUrls;
        }
      }
      
      return [];
    } catch (error) {
      this.logger.warn(`[x_com] Performance API 提取失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 方法3: 通过 GraphQL API 提取视频 URL
   * @private
   */
  async _extractFromGraphQLAPI(tabId, tweetId) {
    if (!tweetId) return [];
    
    try {
      this.logger.info('[x_com] 正在通过 GraphQL API 提取视频 URL...');
      
      const apiScript = `
        (async () => {
          try {
            const ct0 = document.cookie.match(/ct0=([^;]+)/)?.[1];
            const currentTweetId = '${tweetId}';
            
            const variables = {
              tweetId: currentTweetId,
              withCommunity: true,
              includePromotedContent: false,
              withVoice: true
            };
            
            const features = {
              creator_subscriptions_tweet_preview_api_enabled: true,
              premium_content_api_read_enabled: false,
              communities_web_enable_tweet_community_results_fetch: true,
              c9s_tweet_anatomy_moderator_badge_enabled: true,
              responsive_web_grok_analyze_button_fetch_trends_enabled: false,
              responsive_web_grok_analyze_post_followups_enabled: false,
              responsive_web_jetfuel_frame: true,
              responsive_web_grok_share_attachment_enabled: true,
              responsive_web_grok_annotations_enabled: false,
              articles_preview_enabled: true,
              responsive_web_edit_tweet_api_enabled: true,
              graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
              view_counts_everywhere_api_enabled: true,
              longform_notetweets_consumption_enabled: true,
              responsive_web_twitter_article_tweet_consumption_enabled: true,
              tweet_awards_web_tipping_enabled: false,
              responsive_web_grok_show_grok_translated_post: false,
              responsive_web_grok_analysis_button_from_backend: true,
              post_ctas_fetch_enabled: true,
              creator_subscriptions_quote_tweet_preview_enabled: false,
              freedom_of_speech_not_reach_fetch_enabled: true,
              standardized_nudges_misinfo: true,
              tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
              longform_notetweets_rich_text_read_enabled: true,
              longform_notetweets_inline_media_enabled: true,
              profile_label_improvements_pcf_label_in_post_enabled: true,
              responsive_web_profile_redirect_enabled: false,
              rweb_tipjar_consumption_enabled: true,
              verified_phone_label_enabled: false,
              responsive_web_grok_image_annotation_enabled: true,
              responsive_web_grok_imagine_annotation_enabled: true,
              responsive_web_grok_community_note_auto_translation_is_enabled: false,
              responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
              responsive_web_graphql_timeline_navigation_enabled: true,
              responsive_web_enhance_cards_enabled: false
            };
            
            const url = 'https://api.x.com/graphql/YTLCpNxePO-aAmb57DAblw/TweetResultByRestId?' +
              'variables=' + encodeURIComponent(JSON.stringify(variables)) +
              '&features=' + encodeURIComponent(JSON.stringify(features));
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            let response;
            try {
              response = await fetch(url, {
                signal: controller.signal,
                headers: {
                  'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                  'x-csrf-token': ct0 || '',
                  'x-twitter-auth-type': 'OAuth2Session',
                  'x-twitter-active-user': 'yes'
                }
              });
              clearTimeout(timeoutId);
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name === 'AbortError') {
                return { success: false, error: '请求超时' };
              }
              throw fetchError;
            }
            
            if (!response.ok) {
              return { success: false, error: 'HTTP错误: ' + response.status };
            }
            
            const data = await response.json();
            const videoUrls = [];
            
            try {
              const result = data?.data?.tweetResult?.result;
              if (result) {
                const extractVideos = (tweetData) => {
                  const videos = [];
                  const legacy = tweetData?.legacy || tweetData?.tweet?.legacy;
                  
                  // 从 entities.media 提取
                  if (legacy?.entities?.media) {
                    legacy.entities.media.forEach(media => {
                      if (media.type === 'video' || media.type === 'animated_gif') {
                        if (media.video_info?.variants) {
                          media.video_info.variants.forEach(variant => {
                            if (variant.url && variant.content_type && 
                                (variant.content_type.includes('video') || variant.url.includes('.m3u8'))) {
                              videos.push(variant.url);
                            }
                          });
                        }
                      }
                    });
                  }
                  
                  // 从 extended_entities.media 提取
                  if (legacy?.extended_entities?.media) {
                    legacy.extended_entities.media.forEach(media => {
                      if (media.type === 'video' || media.type === 'animated_gif') {
                        if (media.video_info?.variants) {
                          media.video_info.variants.forEach(variant => {
                            if (variant.url && variant.content_type && 
                                (variant.content_type.includes('video') || variant.url.includes('.m3u8'))) {
                              videos.push(variant.url);
                            }
                          });
                        }
                      }
                    });
                  }
                  
                  // 回退：字符串匹配
                  if (videos.length === 0) {
                    const tweetStr = JSON.stringify(tweetData);
                    const matches = tweetStr.match(/https?:\\/\\/video\\.twimg\\.com\\/[^"\\\\]+/g);
                    if (matches) videos.push(...matches);
                  }
                  
                  return videos;
                };
                
                const legacy = result?.legacy || result?.tweet?.legacy;
                const quotedStatus = legacy?.quoted_status_result?.result;
                
                const originalVideos = extractVideos(result);
                if (originalVideos.length > 0) {
                  videoUrls.push(...originalVideos);
                } else if (quotedStatus) {
                  const quotedVideos = extractVideos(quotedStatus);
                  if (quotedVideos.length > 0) {
                    videoUrls.push(...quotedVideos);
                  }
                }
              }
              
              // 回退：全局字符串匹配
              if (videoUrls.length === 0) {
                const dataStr = JSON.stringify(data);
                const allVideoUrls = dataStr.match(/https?:\\/\\/video\\.twimg\\.com\\/[^"\\\\]+/g) || [];
                const relatedVideos = allVideoUrls.filter(url => currentTweetId && url.includes(currentTweetId));
                if (relatedVideos.length > 0) {
                  videoUrls.push(...relatedVideos);
                }
              }
            } catch (e) {
              const dataStr = JSON.stringify(data);
              const allVideoUrls = dataStr.match(/https?:\\/\\/video\\.twimg\\.com\\/[^"\\\\]+/g) || [];
              const relatedVideos = allVideoUrls.filter(url => currentTweetId && url.includes(currentTweetId));
              if (relatedVideos.length > 0) {
                videoUrls.push(...relatedVideos);
              }
            }
            
            return {
              success: true,
              videoUrls: [...new Set(videoUrls)],
              debug: { tweetId: currentTweetId, foundCount: videoUrls.length }
            };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })();
      `;
      
      const apiResult = await Promise.race([
        this.executeScript(tabId, apiScript),
        this.wait(15000).then(() => ({ success: false }))
      ]);
      
      if (apiResult && apiResult.success && apiResult.videoUrls && apiResult.videoUrls.length > 0) {
        // 筛选最佳质量
        const m3u8Urls = apiResult.videoUrls.filter(u => 
          u.includes('.m3u8') && !u.includes('avc1') && !u.includes('mp4a'));
        const mp4Urls = apiResult.videoUrls.filter(u => u.includes('.mp4'));
        
        // 按分辨率排序 MP4
        const sortedMp4 = mp4Urls.sort((a, b) => {
          const getResolution = (url) => {
            const match = url.match(/(\d+)x(\d+)/);
            return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
          };
          return getResolution(b) - getResolution(a);
        });
        
        const selectedUrls = [...m3u8Urls];
        if (sortedMp4.length > 0) {
          selectedUrls.push(sortedMp4[0]);
        }
        
        if (selectedUrls.length > 0) {
          this.logger.info(`[x_com] ✓ 从 GraphQL API 提取到 ${selectedUrls.length} 个视频 URL`);
          return selectedUrls;
        }
      } else if (apiResult.error) {
        this.logger.warn(`[x_com] GraphQL API 调用失败: ${apiResult.error}`);
      }
      
      return [];
    } catch (error) {
      this.logger.warn(`[x_com] GraphQL API 提取失败: ${error.message}`);
      return [];
    }
  }
}

export default XComScrapeExtension;

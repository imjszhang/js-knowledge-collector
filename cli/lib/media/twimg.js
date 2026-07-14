/**
 * X/Twitter twimg 媒体 URL 标准化与合并
 */

export const ALLOWED_HOSTS = ['pbs.twimg.com', 'video.twimg.com'];

const DEFAULT_REFERER = 'https://x.com/';

export function isAllowedMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export function normalizePhotoUrl(src) {
  if (!src || typeof src !== 'string') return null;
  if (!src.includes('pbs.twimg.com/media')) return null;
  if (src.includes('profile_images') || src.includes('avatar') || src.includes('ext_tw_video_thumb')) {
    return null;
  }

  let cleanSrc = src;
  try {
    if (cleanSrc.includes('?')) {
      const urlObj = new URL(cleanSrc);
      urlObj.searchParams.delete('name');
      if (!urlObj.searchParams.has('format')) {
        urlObj.searchParams.set('format', 'jpg');
      }
      urlObj.searchParams.set('name', 'orig');
      cleanSrc = urlObj.toString();
    } else {
      cleanSrc = `${cleanSrc}?format=jpg&name=orig`;
    }
  } catch {
    if (!cleanSrc.includes('?')) {
      cleanSrc = `${cleanSrc}?format=jpg&name=orig`;
    }
  }
  return isAllowedMediaUrl(cleanSrc) ? cleanSrc : null;
}

export function classifyStream(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8') || lower.includes('/pl/')) return 'hls';
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.m4s')) return 'mp4';
  if (lower.includes('video.twimg.com')) return 'mp4';
  return 'unknown';
}

export function pickBestMp4(urls) {
  const mp4s = (urls || []).filter((u) => {
    const s = classifyStream(u);
    return s === 'mp4' && isAllowedMediaUrl(u);
  });
  if (mp4s.length <= 1) return mp4s;

  return mp4s.sort((a, b) => {
    const score = (url) => {
      const m = url.match(/(\d+)x(\d+)/);
      if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
      if (url.includes('1080')) return 1080 * 1920;
      if (url.includes('720')) return 720 * 1280;
      if (url.includes('480')) return 480 * 854;
      return 0;
    };
    return score(b) - score(a);
  });
}

export function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls || []) {
    const u = String(raw || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function normalizeVideoUrls(urls) {
  const allowed = dedupeUrls(urls).filter((u) => !u.startsWith('blob:') && isAllowedMediaUrl(u));
  const mp4s = pickBestMp4(allowed);
  const hls = allowed.filter((u) => classifyStream(u) === 'hls');
  const selected = [...mp4s];
  for (const h of hls) {
    if (!selected.includes(h)) selected.push(h);
  }
  return selected;
}

export function normalizeImageUrls(urls) {
  const out = [];
  const seen = new Set();
  for (const raw of urls || []) {
    const normalized = normalizePhotoUrl(raw) || (isAllowedMediaUrl(raw) ? raw : null);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export function buildMediaItems({ image_urls = [], video_urls = [] } = {}) {
  const images = normalizeImageUrls(image_urls);
  const videos = normalizeVideoUrls(video_urls);
  const items = [];

  images.forEach((url) => {
    items.push({ type: 'photo', url, streamType: 'unknown' });
  });
  videos.forEach((url) => {
    items.push({ type: 'video', url, streamType: classifyStream(url) });
  });
  return items;
}

export function mergeMediaUrls(target = {}, extra = {}) {
  const data = target || {};
  const imageUrls = normalizeImageUrls([
    ...(Array.isArray(data.image_urls) ? data.image_urls : []),
    ...(Array.isArray(extra.image_urls) ? extra.image_urls : []),
  ]);
  const videoUrls = normalizeVideoUrls([
    ...(Array.isArray(data.video_urls) ? data.video_urls : []),
    ...(Array.isArray(extra.video_urls) ? extra.video_urls : []),
  ]);
  data.image_urls = imageUrls;
  data.video_urls = videoUrls;
  data.media_count = imageUrls.length + videoUrls.length;
  return data;
}

export function applyMediaToData(data) {
  if (!data || typeof data !== 'object') return data;
  mergeMediaUrls(data, {});
  return data;
}

export { DEFAULT_REFERER };

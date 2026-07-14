import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhotoUrl,
  pickBestMp4,
  buildMediaItems,
  mergeMediaUrls,
  classifyStream,
  normalizeVideoUrls,
} from './twimg.js';

test('normalizePhotoUrl adds name=orig', () => {
  const url = 'https://pbs.twimg.com/media/AbCdE?format=jpg&name=small';
  const out = normalizePhotoUrl(url);
  assert.ok(out.includes('name=orig'));
  assert.ok(!out.includes('name=small'));
});

test('normalizePhotoUrl rejects profile images', () => {
  assert.equal(
    normalizePhotoUrl('https://pbs.twimg.com/profile_images/abc.jpg'),
    null,
  );
});

test('pickBestMp4 prefers higher resolution', () => {
  const urls = [
    'https://video.twimg.com/abc/720x720/xyz.mp4',
    'https://video.twimg.com/abc/1280x720/xyz.mp4',
  ];
  const sorted = pickBestMp4(urls);
  assert.equal(sorted[0], urls[1]);
});

test('classifyStream detects hls and mp4', () => {
  assert.equal(classifyStream('https://video.twimg.com/pl/abc.m3u8'), 'hls');
  assert.equal(classifyStream('https://video.twimg.com/ext_tw_video/abc.mp4'), 'mp4');
});

test('buildMediaItems dedupes and types', () => {
  const items = buildMediaItems({
    image_urls: [
      'https://pbs.twimg.com/media/A?format=jpg&name=small',
      'https://pbs.twimg.com/media/A?format=jpg&name=orig',
    ],
    video_urls: [
      'https://video.twimg.com/v1.mp4',
      'https://video.twimg.com/v1.mp4',
    ],
  });
  assert.equal(items.filter((i) => i.type === 'photo').length, 1);
  assert.equal(items.filter((i) => i.type === 'video').length, 1);
});

test('mergeMediaUrls merges dom and extra', () => {
  const data = mergeMediaUrls(
    { image_urls: ['https://pbs.twimg.com/media/A?format=jpg&name=orig'] },
    { video_urls: ['https://video.twimg.com/v.mp4'] },
  );
  assert.equal(data.image_urls.length, 1);
  assert.equal(data.video_urls.length, 1);
  assert.equal(data.media_count, 2);
});

test('normalizeVideoUrls prefers mp4 then hls', () => {
  const out = normalizeVideoUrls([
    'https://video.twimg.com/pl/x.m3u8',
    'https://video.twimg.com/720x720/x.mp4',
    'https://video.twimg.com/1280x720/x.mp4',
  ]);
  assert.ok(out[0].includes('.mp4'));
  assert.ok(out.some((u) => u.includes('.m3u8')));
});

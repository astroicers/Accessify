import { describe, it, expect } from 'vitest';
import { parseSitemap, buildTargets } from './discover.js';

const sitemap = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://intra.mil/</loc></url>
  <url><loc> https://intra.mil/about </loc></url>
  <url><loc>https://intra.mil/</loc></url>
  <url><loc>ftp://intra.mil/x</loc></url>
</urlset>`;

describe('discover：sitemap 解析與目標建立（FR-204）', () => {
  it('parseSitemap 取出 http(s) loc、去空白、去重、忽略非 http', () => {
    expect(parseSitemap(sitemap)).toEqual(['https://intra.mil/', 'https://intra.mil/about']);
  });

  it('buildTargets：url 直通', () => {
    expect(buildTargets({ type: 'url', value: 'https://intra.mil/p' })).toEqual(['https://intra.mil/p']);
  });

  it('buildTargets：sitemap 套用 maxPages 上限', () => {
    expect(buildTargets({ type: 'sitemap', sitemapXml: sitemap }, 1)).toEqual(['https://intra.mil/']);
  });
});

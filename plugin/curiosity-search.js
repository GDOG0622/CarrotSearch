function parseSearchResults(html, limit = 15) {
    let cheerio;
    try { cheerio = require('cheerio'); }
    catch { throw new Error('自主搜索依赖未安装，请重新安装 CarrotSearch 后端'); }
    const $ = cheerio.load(String(html));
    const results = [];
    const seen = new Set();
    $('#urls article.result').each((_, article) => {
        if (results.length >= limit) return;
        const link = $(article).find('a.url_header, a.url_wrapper').first();
        const url = link.attr('href') || '';
        let parsed;
        try { parsed = new URL(url); } catch { return; }
        if (!['http:', 'https:'].includes(parsed.protocol) || seen.has(parsed.href)) return;
        const content = $(article).find('p.content').first().text().replace(/\s+/g, ' ').trim();
        const title = link.find('h3').text().trim() || link.text().replace(/\s+/g, ' ').trim();
        if (!content && !title) return;
        seen.add(parsed.href);
        results.push({ title: title.slice(0, 500), url: parsed.href, content: content.slice(0, 4000) });
    });
    return results;
}

async function searchSearxng(baseUrl, query, preferences = '', fetchImpl = fetch) {
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('SearXNG 地址无效');
    const url = new URL('/search', base);
    url.searchParams.set('q', query);
    if (preferences) url.searchParams.set('preferences', preferences);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`SearXNG 搜索失败（HTTP ${response.status}）`);
    return parseSearchResults(await response.text());
}

module.exports = { parseSearchResults, searchSearxng };

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


function normalizeResults(source, data) {
    if (source === 'searxng') return parseSearchResults(data);
    let rows;
    if (source === 'serpapi') rows = data.organic_results;
    else if (source === 'serper') rows = data.organic;
    else if (source === 'tavily') rows = data.results;
    else if (source === 'zai') rows = data.search_result;
    else if (source === 'koboldcpp') rows = data;
    else if (source === 'extras' || source === 'plugin') {
        // These providers return separate arrays rather than guaranteed paired results.
        // Keep their text together without falsely attributing snippets to individual URLs.
        const content = typeof data.results === 'string' ? data.results : '';
        const links = Array.isArray(data.links) ? data.links : [];
        rows = links.map(link => ({ link, content: '' }));
        if (content) rows.unshift({ title: '搜索结果', content });
    } else throw new Error(`不支持的搜索来源：${source}`);
    if (!Array.isArray(rows)) throw new Error(`${source} 返回的搜索结果格式不正确`);
    return rows.slice(0, 15).map(item => ({
        title: String(item.title || '').slice(0, 500),
        url: String(item.url || item.link || ''),
        content: String(item.content || item.snippet || item.desc || '').slice(0, 4000),
    })).filter(item => item.title || item.url || item.content);
}

async function searchConfiguredSource({ source, websearch, settings, query, invoke }) {
    const supported = ['searxng', 'serpapi', 'serper', 'tavily', 'zai', 'koboldcpp', 'extras', 'plugin'];
    if (!supported.includes(source)) throw new Error(`不支持的搜索来源：${source}`);
    const body = { query };
    if (source === 'searxng') Object.assign(body, { baseUrl: websearch.searxng_url, preferences: websearch.searxng_preferences });
    if (source === 'koboldcpp') body.url = settings.textgenerationwebui_settings?.server_urls?.koboldcpp;
    if (source === 'extras' || source === 'plugin') Object.assign(body, { engine: websearch.extras_engine, include_images: false });
    const data = await invoke(source, body, settings);
    return normalizeResults(source, data);
}

module.exports = { parseSearchResults, searchSearxng, normalizeResults, searchConfiguredSource };

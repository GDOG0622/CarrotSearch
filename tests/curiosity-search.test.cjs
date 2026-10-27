const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSearchResults, searchSearxng } = require('../plugin/curiosity-search');

const html = `<div id="urls"><article class="result"><a class="url_header" href="https://example.com/a"><h3>猫与纸箱</h3></a><p class="content">猫 &amp; 纸箱</p></article><article class="result"><a class="url_header" href="javascript:alert(1)"><h3>bad</h3></a><p class="content">bad</p></article><article class="result"><a class="url_header" href="https://example.com/a">重复</a></article></div>`;

test('extracts matching titles, URLs and snippets and rejects unsafe or duplicate links', () => {
    assert.deepEqual(parseSearchResults(html), [{ title: '猫与纸箱', url: 'https://example.com/a', content: '猫 & 纸箱' }]);
});

test('sends query and preferences to configured instance and rejects failed responses', async () => {
    const results = await searchSearxng('http://127.0.0.1:8889', '猫 纸箱', 'prefs', async url => {
        assert.equal(url.pathname, '/search');
        assert.equal(url.searchParams.get('q'), '猫 纸箱');
        assert.equal(url.searchParams.get('preferences'), 'prefs');
        return { ok: true, text: async () => html };
    });
    assert.equal(results.length, 1);
    await assert.rejects(searchSearxng('http://127.0.0.1:8889', '猫', '', async () => ({ ok: false, status: 429 })), /429/);
});

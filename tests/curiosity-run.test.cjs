const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCuriosityCheck } = require('../plugin/curiosity-run');

function fixture(replies) {
    const calls = [], writes = [];
    const args = {
        user: 'u', config: { apiProfileId: 'profile', apiModel: 'model', customPrompt: '自定义', searxngUrl: 'http://127.0.0.1:8889' },
        scheme: { charName: '阿甲', worldBook: '阿甲搜索' },
        loadCard: async () => ({ name: '阿甲', description: '角色人设' }),
        loadWorld: async () => ({ entries: { 1: { comment: '之前搜索', content: '猫', carrotSearch: { type: 'summary', timestamp: '2026-01-01' } } } }),
        callAI: async (...args) => { calls.push(args); return replies.shift(); },
        search: async (url, query) => [{ title: '文章', url: 'https://example.com', content: `${url} ${query}` }],
        save: async (...args) => writes.push(args),
        now: () => new Date('2026-10-27T14:30:00Z'), random: () => 0.25, makeId: () => 'id-1',
    };
    return { args, calls, writes };
}

test('a no-search decision stops without search, summary or worldbook write', async () => {
    const f = fixture(['{"search":false}']);
    f.args.search = () => { throw Error('unexpected search'); };
    assert.deepEqual(await runCuriosityCheck(f.args), { searched: false });
    assert.equal(f.calls.length, 1);
    assert.equal(f.writes.length, 0);
    assert.match(f.calls[0][3], /角色人设[\s\S]*自定义[\s\S]*之前搜过猫|角色人设[\s\S]*自定义[\s\S]*之前搜索/);
});

test('a search decision uses actual results to produce one paired write', async () => {
    const f = fixture(['{"search":true,"query":"小猫纸箱"}', '{"title":"纸箱","summary":"了解了猫喜欢纸箱","keywords":["猫","纸箱"]}']);
    const result = await runCuriosityCheck(f.args);
    assert.equal(result.searched, true);
    assert.equal(f.calls.length, 2);
    assert.match(f.calls[1][3], /https:\/\/example.com/);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0][1], '阿甲搜索');
    assert.equal(f.writes[0][2].query, '小猫纸箱');
    assert.deepEqual(f.writes[0][2].summary.keywords, ['猫', '纸箱']);
});

test('empty results or invalid model output never save fabricated records', async () => {
    const empty = fixture(['{"search":true,"query":"小猫"}']);
    empty.args.search = async () => [];
    await assert.rejects(runCuriosityCheck(empty.args), /没有返回/);
    assert.equal(empty.writes.length, 0);
    const bad = fixture(['{"search":true,"query":"小猫"}', '{"title":"猫","summary":"内容","keywords":[]}']);
    await assert.rejects(runCuriosityCheck(bad.args), /关键词/);
    assert.equal(bad.writes.length, 0);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDecisionPrompt, parseDecision, parseSummary, makeEntries } = require('../plugin/curiosity-core');

test('decision context follows character, custom prompt and worldbook order without chat history', () => {
    const text = buildDecisionPrompt({ card: { name: '阿甲', description: '角色人设' }, customPrompt: '自定义', recent: ['之前搜过猫'], now: '10:00', ordinary: false });
    assert.ok(text.indexOf('角色人设') < text.indexOf('自定义') && text.indexOf('自定义') < text.indexOf('之前搜过猫'));
    assert.match(text, /好奇心不受职业/);
    assert.match(text, /不是已发生的事实/);
});

test('decision parsing fails closed instead of treating strings as true', () => {
    assert.deepEqual(parseDecision('{"search":false}'), { search: false });
    assert.deepEqual(parseDecision('```json\n{"search":true,"query":" 小猫 "}\n```'), { search: true, query: '小猫' });
    assert.throws(() => parseDecision('{"search":"false","query":"猫"}'));
    assert.throws(() => parseDecision('{"search":true,"query":""}'));
});

test('summary needs actual separated keywords, a title and content', () => {
    assert.deepEqual(parseSummary('{"title":"猫","summary":"查到猫喜欢纸箱","keywords":["猫","纸箱","猫"]}'), { title: '猫', summary: '查到猫喜欢纸箱', keywords: ['猫', '纸箱'] });
    assert.throws(() => parseSummary('{"title":"猫","summary":"内容","keywords":[]}'));
});

test('creates a disabled detailed entry and a green keyword-triggered summary at system depth one', () => {
    const [detail, summary] = makeEntries({ firstUid: 10, timestamp: '2026-10-27 14:30', query: '猫', results: [{ title: '文章', url: 'https://example.com', content: '内容' }], summary: { title: '纸箱', summary: '搜索摘要', keywords: ['猫', '纸箱'] }, runId: 'one' });
    assert.equal(detail.disable, true);
    assert.match(detail.content, /2026-10-27 14:30[\s\S]*https:\/\/example.com[\s\S]*内容/);
    assert.equal(summary.uid, 11);
    assert.equal(summary.disable, false);
    assert.equal(summary.constant, false);
    assert.equal(summary.position, 4);
    assert.equal(summary.role, 0);
    assert.equal(summary.depth, 1);
    assert.equal(summary.order, 0);
    assert.equal(summary.probability, 100);
    assert.equal(summary.excludeRecursion, true);
    assert.equal(summary.preventRecursion, true);
    assert.equal(summary.delayUntilRecursion, false);
    assert.deepEqual(summary.key, ['猫', '纸箱']);
});

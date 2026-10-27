import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { collectTimelineGroups } from '../reasoning-timeline.js';

const user = { is_user: true, mes: '问题' };
const thought = text => ({ mes: '', extra: { reasoning: text } });
const tool = name => ({ is_system: true, extra: { tool_invocations: [{ name }] } });
const answer = { mes: '回答', extra: { reasoning: '总结' } };

test('groups consecutive reasoning, tool calls and the final answer in order', () => {
    const chat = [user, thought('一'), tool('WebSearch'), thought('二'), tool('VisitLinks'), answer];
    assert.deepEqual(collectTimelineGroups(chat), [{ start: 1, end: 5, anchor: 5 }]);
});

test('does not consume a prior visible reply or cross a user message', () => {
    const chat = [user, { mes: '之前的回复' }, user, tool('WebSearch'), answer, { mes: '后续回复' }];
    assert.deepEqual(collectTimelineGroups(chat), [{ start: 3, end: 4, anchor: 4 }]);
});

test('keeps a tool result usable before the final answer exists', () => {
    assert.deepEqual(collectTimelineGroups([user, thought('一'), tool('WebSearch')]), [{ start: 1, end: 2, anchor: 2 }]);
});

test('does not hide an intermediate message with attachments', () => {
    const chat = [user, { mes: '', extra: { files: [{}], reasoning: '有附件' } }, tool('WebSearch'), answer];
    assert.deepEqual(collectTimelineGroups(chat), [{ start: 2, end: 3, anchor: 3 }]);
});

test('tool actions preserve their results, failures and registration names', async () => {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const start = source.indexOf('function registerFunctionTools()');
    const block = source.slice(start, source.indexOf('/**', start));
    const registered = [];
    const pending = [];
    const expected = { text: '结果', links: ['https://example.com'], images: [] };
    const sandbox = {
        SillyTavern: { getContext: () => ({ registerFunctionTool: tool => registered.push(tool), unregisterFunctionTool: () => {} }) },
        extension_settings: { websearch: { enabled: true, use_function_tool: true } },
        setPendingTool: (...args) => pending.push(args),
        isSearchAvailable: async () => true,
        performSearchRequest: async (query, options) => { assert.equal(query, '测试'); assert.equal(options.useCache, true); return expected; },
        isAllowedUrl: link => link.startsWith('https:'),
        visitLink: async link => ({ link, text: '内容' }),
        console,
    };
    vm.runInNewContext(`${block}\nregisterFunctionTools();`, sandbox);
    assert.deepEqual(registered.map(tool => tool.name), ['WebSearch', 'VisitLinks']);
    assert.equal(await registered[0].action({ query: '测试' }), expected);
    assert.deepEqual(pending.map(entry => entry[0]), ['WebSearch', null]);
    await assert.rejects(registered[0].action({}), /No query provided/);
    assert.equal(pending.at(-1)[0], null);
    const visited = await registered[1].action({ links: ['https://example.com', 'http://blocked'] });
    assert.equal(visited.length, 1);
    assert.equal(visited[0].link, 'https://example.com');
});

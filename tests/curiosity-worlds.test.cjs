const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorldStore } = require('../plugin/curiosity-worlds');

test('appends paired entries while preserving existing book data and avoids duplicate runs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carrot-world-test-'));
    try {
        const dir = path.join(root, 'user', 'worlds'); fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, '角色搜索.json');
        fs.writeFileSync(file, JSON.stringify({ entries: { 4: { uid: 4, content: '已有条目' } }, extensions: { keep: true } }));
        const store = createWorldStore(root);
        const record = { timestamp: '2026-10-27 14:30', query: '猫', results: [{ title: '猫', url: 'https://example.com', content: '内容' }], summary: { title: '猫', summary: '摘要', keywords: ['猫'] }, runId: 'one' };
        assert.deepEqual(store.list('user'), ['角色搜索']);
        store.append('user', '角色搜索', record);
        store.append('user', '角色搜索', record);
        const data = store.read('user', '角色搜索');
        assert.equal(data.extensions.keep, true);
        assert.equal(data.entries[4].content, '已有条目');
        assert.equal(data.entries[5].disable, true);
        assert.equal(data.entries[6].disable, false);
        assert.equal(Object.keys(data.entries).length, 3);
        assert.throws(() => store.read('user', '../其他'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('detects a concurrent file change instead of overwriting it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carrot-world-race-'));
    const originalWrite = fs.writeFileSync;
    try {
        const dir = path.join(root, 'user', 'worlds'); fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, '角色搜索.json');
        originalWrite(file, JSON.stringify({ entries: { 0: { uid: 0, content: '原始' } } }));
        const other = JSON.stringify({ entries: { 0: { uid: 0, content: '另一处修改' } } });
        fs.writeFileSync = (target, ...args) => {
            const result = originalWrite(target, ...args);
            if (String(target).includes('.carrot-')) originalWrite(file, other);
            return result;
        };
        const record = { timestamp: '时间', query: '猫', results: [], summary: { title: '猫', summary: '摘要', keywords: ['猫'] }, runId: 'one' };
        assert.throws(() => createWorldStore(root).append('user', '角色搜索', record), /发生改变/);
        assert.equal(fs.readFileSync(file, 'utf8'), other);
    } finally { fs.writeFileSync = originalWrite; fs.rmSync(root, { recursive: true, force: true }); }
});

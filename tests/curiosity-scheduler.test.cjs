const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
    const timers = new Map(), saved = [], runs = [];
    let timerId = 0;
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const proactive = { getDataDir: () => '/fixture', listUsers: () => ['u'], listChars: () => ['角色'], loadCharCard: () => ({}), callAI: () => {}, loadSettings: () => ({}) };
    const store = { list: () => ['世界书'], read: () => ({ entries: {} }), append: (...args) => saved.push(args), revision: () => 'hash' };
    const dependencies = {
        './support': proactive,
        './curiosity-worlds': { createWorldStore: () => store },
        './curiosity-search': { searchConfiguredSource: () => {} },
        './curiosity-run': { runCuriosityCheck: async args => { runs.push(args); await blocked; await args.save('u', '世界书', {}); return { searched: true }; } },
    };
    const context = vm.createContext({ module: { exports: {} }, require: name => dependencies[name], URL, console, Math, Date,
        setInterval(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; }, clearInterval(id) { timers.delete(id); } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugin/curiosity.js'), 'utf8'), context);
    const config = { enabled: true, stUser: 'u', apiProfileId: 'p', searxngUrl: 'http://127.0.0.1:8889', schemes: [{ id: 'a', enabled: true, charName: '角色', worldBook: '世界书', intervalMinutes: 60, mode: 'ai' }] };
    return { api: context.module.exports, config, timers, runs, saved, release, support: proactive };
}

test('timers are independent, do not overlap and do not write after stopping', async () => {
    const f = setup(); f.api.startUser('u', f.config);
    assert.equal(f.timers.size, 1);
    const tick = [...f.timers.values()][0].fn;
    const first = tick(); await tick();
    assert.equal(f.runs.length, 1);
    f.api.stopUser('u'); f.release(); await first;
    assert.equal(f.saved.length, 0);
    assert.equal(f.timers.size, 0);
});

test('reuses existing timer when only the prompt changes', () => {
    const f = setup(); f.api.startUser('u', f.config);
    const timer = [...f.timers.values()][0];
    f.api.startUser('u', { ...f.config, customPrompt: '新提示词' });
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers.values()][0], timer);
    f.api.stopUser('u');
});

test('invalid new configuration stops previously running autonomous searches', () => {
    const f = setup(); f.api.startUser('u', f.config);
    assert.throws(() => f.api.startUser('u', { ...f.config, searxngUrl: '' }));
    assert.equal(f.timers.size, 0);
});

test('rejects cross-user HTTP requests', () => {
    const f = setup(); let code = 0;
    f.api.worldsHandler({ query: { user: 'u' }, user: { profile: { handle: 'other', admin: false } } }, { status(n) { code=n; return this; }, json() {} });
    assert.equal(code, 403);
});

test('skips a tick while the target worldbook is being edited', async () => {
    const f = setup(); f.api.startUser('u', f.config);
    const response = { json() {}, status() { return this; } };
    f.api.editorHandler({ body: { stUser:'u', client:'tab-1', book:'世界书' }, user: { profile: { handle:'u' } } }, response);
    await [...f.timers.values()][0].fn();
    assert.equal(f.runs.length, 0);
    f.api.stopUser('u');
});

test('manual check runs the same decision pipeline on an enabled scheme', async () => {
    const f = setup(); f.api.startUser('u', f.config);
    let output;
    const response = { json(data) { output=data; return this; }, status() { return this; } };
    const run = f.api.runNowHandler({ body: { stUser:'u', id:'a' }, user: { profile: { handle:'u' } } }, response);
    f.release(); await run;
    assert.equal(output.ok, true);
    assert.equal(output.searched, true);
    assert.equal(f.saved.length, 1);
    f.api.stopUser('u');
});

test('restart restores configuration from CarrotSearch settings, independently of Carrot', () => {
    const f = setup();
    f.support.loadSettings = () => ({ extension_settings: { websearch: { curiosity: f.config } } });
    f.api.resume();
    assert.equal(f.timers.size, 1);
    f.api.stopUser('u');
});

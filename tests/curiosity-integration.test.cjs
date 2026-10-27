const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const proactive = require('../plugin/support');
const curiosity = require('../plugin/curiosity');

test('timer connects the real decision, SearXNG parsing and paired worldbook save without chat messages', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carrot-curiosity-integration-'));
    const original = { ...proactive }, fetchOriginal = global.fetch, intervalOriginal = global.setInterval, clearOriginal = global.clearInterval;
    let tick, aiCalls = 0;
    try {
        const worldDir = path.join(root, 'u', 'worlds'); fs.mkdirSync(worldDir, { recursive:true });
        const bookPath = path.join(worldDir, '角色搜索.json');
        fs.writeFileSync(bookPath, JSON.stringify({ entries:{ 7:{uid:7,content:'旧条目'} } }));
        proactive.getDataDir = () => root;
        proactive.listUsers = () => ['u']; proactive.listChars = () => ['角色'];
        proactive.loadSettings = () => ({extension_settings:{websearch:{source:'searxng',searxng_url:'http://127.0.0.1:8889',searxng_preferences:'pref'}}});
        proactive.loadCharCard = () => ({name:'角色',description:'角色人设'});
        proactive.callAI = async (_u, _p, _m, prompt) => {
            aiCalls++;
            if (aiCalls === 1) { assert.match(prompt,/角色人设[\s\S]*自定义[\s\S]*搜索世界书/); return '{"search":true,"query":"小猫"}'; }
            assert.match(prompt,/https:\/\/example.com\/cat/);
            return '{"title":"小猫","summary":"了解了小猫","keywords":["小猫","猫咪"]}';
        };
        global.fetch = async url => {
            assert.equal(new URL(url).searchParams.get('q'),'小猫');
            assert.equal(new URL(url).searchParams.get('preferences'),'pref');
            return {ok:true,text:async()=>'<div id="urls"><article class="result"><a class="url_header" href="https://example.com/cat"><h3>小猫</h3></a><p class="content">猫的习惯</p></article></div>'};
        };
        global.setInterval = fn => { tick=fn; return 1; }; global.clearInterval = () => {};
        curiosity.startUser('u',{enabled:true,apiProfileId:'p',customPrompt:'自定义',searxngUrl:'http://127.0.0.1:8889',schemes:[{id:'x',enabled:true,charName:'角色',worldBook:'角色搜索',intervalMinutes:60,mode:'ai'}]});
        await tick();
        const data=JSON.parse(fs.readFileSync(bookPath,'utf8'));
        assert.equal(data.entries[7].content,'旧条目');
        assert.equal(data.entries[8].disable,true);
        assert.match(data.entries[8].content,/https:\/\/example.com\/cat/);
        assert.equal(data.entries[9].disable,false);
        assert.deepEqual(data.entries[9].key,['小猫','猫咪']);
        assert.equal(data.entries[9].position,4);
        assert.equal(data.entries[9].depth,1);
        assert.equal(data.entries[9].excludeRecursion,true);
        assert.equal(data.entries[9].preventRecursion,true);
        assert.equal(aiCalls,2);
        assert.deepEqual(fs.readdirSync(path.join(root,'u')),['worlds']);
    } finally {
        curiosity.stopUser('u'); Object.assign(proactive,original);
        global.fetch=fetchOriginal;global.setInterval=intervalOriginal;global.clearInterval=clearOriginal;
        fs.rmSync(root,{recursive:true,force:true});
    }
});

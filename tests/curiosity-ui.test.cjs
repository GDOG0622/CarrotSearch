const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

test('autonomous search panel configures an independent role and bound worldbook', { skip: !process.env.CARROT_PLAYWRIGHT_MODULE }, async () => {
    const { chromium } = require(process.env.CARROT_PLAYWRIGHT_MODULE);
    const posts = [];
    const source = fs.readFileSync(path.join(__dirname, '../curiosity.js'), 'utf8');
    const server = http.createServer((req, res) => {
        if (req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<link rel="stylesheet" href="/assets/style.css"><style>body{margin:8px}.text_pole{box-sizing:border-box;max-width:100%}button{white-space:nowrap}</style><div id="curiosity-container"></div><script>window.state={websearch:{source:'searxng',searxng_url:'http://127.0.0.1:8889',searxng_preferences:'pref',curiosity:{enabled:false,stUser:'',apiProfileId:'',apiModel:'',customPrompt:null,searxngUrl:'',searxngPreferences:'',schemes:[]}}};window.SillyTavern={getContext:()=>({eventTypes:{},eventSource:{on(){}}})}</script><script type="module">import {initCuriosity} from '/scripts/extensions/third-party/CarrotSearch/curiosity.js';initCuriosity()</script>`); return; }
        if (req.url === '/assets/style.css') { res.setHeader('content-type', 'text/css'); res.end(fs.readFileSync(path.join(__dirname, '../style.css'))); return; }
        if (req.url.endsWith('/curiosity.js')) { res.setHeader('content-type', 'text/javascript'); res.end(source); return; }
        if (req.url.endsWith('/extensions.js')) { res.setHeader('content-type', 'text/javascript'); res.end('export const extension_settings=window.state'); return; }
        if (req.url.endsWith('/script.js')) { res.setHeader('content-type', 'text/javascript'); res.end('export const getRequestHeaders=()=>({"content-type":"application/json"}); export const saveSettingsDebounced=()=>{}'); return; }
        if (req.url.endsWith('/world-info.js')) { res.setHeader('content-type', 'text/javascript'); res.end('export const worldInfoCache=new Map()'); return; }
        if (req.url.includes('/api/plugins/carrotsearch/')) {
            res.setHeader('content-type', 'application/json');
            if (req.method === 'POST') { let body=''; req.on('data', x=>body+=x); req.on('end',()=>{posts.push({url:req.url,body:JSON.parse(body)});res.end(JSON.stringify({ok:true,running:1,revisions:{}}))}); return; }
            let data = {ok:true};
            if (req.url.endsWith('/users')) data.users=['u'];
            if (req.url.endsWith('/defaults')) data.customPrompt='默认的好奇心';
            if (req.url.includes('/chars?')) data.chars=['角色'];
            if (req.url.includes('/worlds?')) data.worlds=['角色搜索'];
            if (req.url.includes('/profiles?')) data.profiles=[{id:'profile',name:'方案'}];
            res.end(JSON.stringify(data)); return;
        }
        res.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless:true, executablePath:process.env.CARROT_PLAYWRIGHT_BROWSER || undefined });
        const page=await browser.newPage({viewport:{width:393,height:900}});
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForSelector('#cip-curiosity-add');
        assert.equal(await page.locator('#cip-curiosity-user, #cip-curiosity-profile, #cip-curiosity-url').count(), 0);
        await page.click('#cip-curiosity-add');
        await page.selectOption('.cur-char','角色');
        await page.selectOption('.cur-world','角色搜索');
        await page.fill('.cur-interval','60');
        await page.locator('.cur-interval').dispatchEvent('change');
        await page.click('.cur-save');
        await page.locator('.cur-enabled').check();
        await page.locator('#cip-curiosity-enabled').check();
        await page.waitForFunction(() => document.querySelector('#cip-curiosity-status')?.textContent.includes('已同步'));
        const start=posts.filter(x=>x.url.endsWith('/curiosity/start')).at(-1);
        assert.equal(start.body.schemes[0].charName,'角色');
        assert.equal(start.body.schemes[0].worldBook,'角色搜索');
        assert.equal(start.body.schemes[0].mode,'ai');
        assert.equal(start.body.searxngUrl,'http://127.0.0.1:8889');
        assert.equal(start.body.stUser,'u');
        assert.equal(start.body.searxngPreferences,'pref');
        await page.evaluate(() => { const editor=document.createElement('div');editor.id='world_popup';editor.innerHTML='<select id="world_editor_select"><option value="">请选择</option><option value="0" selected>角色搜索</option></select>';document.body.append(editor);editor.querySelector('select').dispatchEvent(new Event('change',{bubbles:true})); });
        await page.waitForTimeout(600);
        assert.ok(posts.some(item=>item.url.endsWith('/curiosity/editor') && item.body.book==='角色搜索'));
        for(const width of [320,393,1280]) { await page.setViewportSize({width,height:900}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`); }
    } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
});

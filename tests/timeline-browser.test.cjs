const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = process.env.CARROTSEARCH_PLAYWRIGHT_MODULE;
test('timeline renders, expands, restores native records and survives refresh events', { skip: !playwrightPath }, async () => {
    const { chromium } = require(playwrightPath);
    const root = path.resolve(__dirname, '..');
    const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css">
    <style>.mes:not(.reasoning) .mes_reasoning_details {display:none} .mes_reasoning_details:not([open]) .mes_reasoning_actions {display:none} body{margin:0} .mes{padding:8px} </style>
    <div id="chat"></div><script type="module">
    import {initReasoningTimeline,setPendingTool} from '/reasoning-timeline.js';
    const events = {};
    const state = {chat:[], eventTypes:Object.fromEntries(['CHAT_CHANGED','TOOL_CALLS_RENDERED','STREAM_TOKEN_RECEIVED','MESSAGE_REASONING_EDITED'].map(x=>[x,x])), eventSource:{on:(n,f)=>(events[n] ||= []).push(f)}, messageFormatting:(s)=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML}};
    window.SillyTavern={getContext:()=>state}; window.state=state; window.emit=(e)=>{for(const f of events[e]||[])f()}; window.pending=setPendingTool;
    window.draw=()=>{document.querySelector('#chat').innerHTML=state.chat.map((m,i)=>'<div class="mes '+(m.extra?.reasoning?'reasoning':'')+'" mesid="'+i+'"><div class="mes_block"><details class="mes_reasoning_details"><summary class="mes_reasoning_summary"><span class="mes_reasoning_header"><span class="mes_reasoning_header_title">思考过程</span><i class="mes_reasoning_arrow"></i></span><span class="mes_reasoning_actions"><button class="mes_reasoning_edit">编辑</button></span></summary><div class="mes_reasoning">'+(m.extra?.reasoning||'')+'</div></details><div class="mes_text"></div></div></div>').join('')};
    document.addEventListener('click', e=>{if(e.target.closest('.mes_reasoning_details')&&!e.target.closest('.mes_reasoning_header')) e.preventDefault()});
    initReasoningTimeline(); window.ready=true;</script>`;
    const server = http.createServer((req, res) => {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
        const name = req.url === '/reasoning-timeline.js' ? 'reasoning-timeline.js' : req.url === '/style.css' ? 'style.css' : null;
        if (!name) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(path.join(root, name)));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CARROTSEARCH_BROWSER || undefined });
        const page = await browser.newPage({ viewport: { width: 393, height: 844 } });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        const chat = [
            { is_user: true, mes: '问题' },
            { mes: '', extra: { reasoning: '先查一下' } },
            { is_system: true, mes: '原始 JSON', extra: { tool_invocations: [{ name: 'WebSearch', reasoning: '先查一下', parameters: '{"query":"企鹅"}', result: { text: '网页摘要', links: ['https://example.com/a', 'javascript:alert(1)'] } }] } },
            { mes: '', extra: { reasoning: '继续查' } },
            { is_system: true, mes: '原始 JSON', extra: { tool_invocations: [{ name: 'VisitLinks', parameters: '{"links":["https://example.com/a"]}', result: [{ link: 'https://example.com/a', text: '页面内容' }] }] } },
            { mes: '最终回答', extra: { reasoning: '可以回答了' } },
        ];
        await page.evaluate(chat => { state.chat=chat; draw(); emit('CHAT_CHANGED'); }, chat);
        await page.waitForSelector('.carrotsearch-timeline-host');
        assert.equal(await page.locator('.carrotsearch-timeline-source').count(), 4);
        assert.equal(await page.locator('.carrotsearch-tool-card').count(), 2);
        const text = await page.locator('.carrotsearch-timeline').textContent();
        assert.ok(text.indexOf('先查一下') < text.indexOf('企鹅') && text.indexOf('企鹅') < text.indexOf('继续查') && text.indexOf('继续查') < text.indexOf('访问网页') && text.indexOf('访问网页') < text.indexOf('可以回答了'));
        assert.equal((text.match(/先查一下/g) || []).length, 1);
        await page.locator('.mes[mesid="5"] .mes_reasoning_header').click();
        await page.locator('.carrotsearch-result summary').first().click();
        assert.equal(await page.locator('.carrotsearch-result[open] a').count(), 1);
        assert.equal(await page.locator('.carrotsearch-result[open] a').first().getAttribute('href'), 'https://example.com/a');
        if (process.env.CARROTSEARCH_SCREENSHOT) await page.screenshot({ path: process.env.CARROTSEARCH_SCREENSHOT });
        await page.evaluate(() => { state.chat[5].extra.reasoning = '可以回答了！'; emit('STREAM_TOKEN_RECEIVED'); });
        await page.waitForFunction(() => document.querySelector('.carrotsearch-timeline')?.textContent.includes('可以回答了！'));
        assert.equal(await page.locator('.carrotsearch-result[open]').count(), 1);
        await page.locator('.carrotsearch-original-toggle').click();
        await page.waitForSelector('.carrotsearch-original-mode');
        assert.equal(await page.locator('.carrotsearch-timeline-source').count(), 0);
        assert.deepEqual(await page.evaluate(() => state.chat.map(m => m.mes)), chat.map(m => m.mes));
        await page.locator('.carrotsearch-original-toggle').click();
        await page.waitForFunction(() => !document.querySelector('.carrotsearch-original-mode'));
        await page.evaluate(() => { draw(); emit('CHAT_CHANGED'); });
        await page.waitForSelector('.carrotsearch-timeline-host');
        assert.equal(await page.locator('.carrotsearch-tool-card').count(), 2);
        await page.evaluate(() => { document.querySelector('.mes[mesid="5"]').classList.remove('carrotsearch-timeline-host'); document.querySelector('.carrotsearch-timeline').remove(); emit('MESSAGE_REASONING_EDITED'); });
        await page.waitForSelector('.mes[mesid="5"].carrotsearch-timeline-host .carrotsearch-timeline', { state: 'attached' });
        for (const width of [320, 393, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
        }
        await page.evaluate(() => { state.chat=[{is_user:true,mes:'问题'}]; draw(); emit('CHAT_CHANGED'); pending('WebSearch',{query:'测试'}); });
        await page.waitForSelector('.carrotsearch-pending-host');
        assert.match(await page.locator('.carrotsearch-pending-host').innerText(), /正在搜索/);
        await page.evaluate(() => pending(null));
        await page.waitForSelector('.carrotsearch-pending-host', { state: 'detached' });
        await page.evaluate(() => { state.chat=[{is_user:true,mes:'问题'},{is_system:true,extra:{tool_invocations:[{name:'WebSearch',parameters:{query:'无思考'},result:{text:'',links:[]}}]}},{mes:'回复'}]; draw(); emit('CHAT_CHANGED'); });
        await page.waitForSelector('.carrotsearch-timeline-host');
        await page.locator('.carrotsearch-timeline-host .mes_reasoning_header').click();
        assert.match(await page.locator('.carrotsearch-timeline').innerText(), /未返回搜索结果/);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

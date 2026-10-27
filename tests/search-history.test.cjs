const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

test('history shows only selected character records, safely opens links in new tabs', {skip:!process.env.CARROT_PLAYWRIGHT_MODULE}, async()=>{
 const {chromium}=require(process.env.CARROT_PLAYWRIGHT_MODULE);
 const detail=(name,url,date)=>({carrotSearch:{source:'carrot-autonomous-search',type:'detail',timestamp:date},content:`搜索时间：${date}\n搜索词：猫\n\n1. ${name}\n链接：${url}\n内容：内容`});
 const books={A:{entries:{1:detail('小猫','https://example.com/a','2026-10-27 14:27:00'),2:detail('恶意','javascript:alert(1)','2026-10-27 14:27:00'),3:{content:'无关',carrotSearch:{type:'summary'}}}}, B:{entries:{1:detail('动漫','https://example.com/b','2026-10-26 10:00:00')}}};
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(`<link rel="stylesheet" href="/style.css"><section id="history"></section><script type="module">import {initSearchHistory} from '/search-history.js'; window.config={schemes:[{id:'a',charName:'角色甲',worldBook:'A',enabled:true},{id:'b',charName:'角色乙',worldBook:'B',enabled:false}]};window.historyPanel=initSearchHistory(document.querySelector('#history'),window.config,async (url,body)=>{let r=await fetch(url,{method:'POST',headers:{'Content-type':'application/json'},body:JSON.stringify(body)});return r.json()});</script>`);return;}
  if(req.url==='/search-history.js'||req.url==='/style.css'){res.setHeader('content-type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(__dirname,'..',req.url)));return;}
  if(req.url==='/api/worldinfo/get'){let body='';req.on('data',x=>body+=x);req.on('end',()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(books[JSON.parse(body).name]));});return;}
  res.writeHead(404).end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser;
 try { browser=await chromium.launch({headless:true,executablePath:process.env.CARROT_PLAYWRIGHT_BROWSER});const page=await browser.newPage({viewport:{width:320,height:800}});await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText('小猫').waitFor(); assert.equal(await page.locator('.carrotsearch-history-row').count(),1);const link=page.locator('.carrotsearch-history-row');assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');assert.equal(await link.getAttribute('href'),'https://example.com/a');
 await page.locator('.carrotsearch-history-picker summary').click();await page.getByRole('button',{name:'角色乙'}).click();await page.getByText('动漫').waitFor();assert.equal(await page.getByText('小猫').count(),0);assert.equal(await page.locator('.carrotsearch-history-row').getAttribute('href'),'https://example.com/b');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});

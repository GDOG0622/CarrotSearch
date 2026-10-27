const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('AI uses the latest saved custom connection, model and active key', async () => {
    let settings = { main_api:'openai', oai_settings:{ chat_completion_source:'custom', custom_url:'https://first.example/v1', custom_model:'first' } };
    const secrets = { api_key_custom:[{active:false,value:'old'},{active:true,value:'active'}] };
    const requests=[];
    const fakeFs = { existsSync:()=>true, readFileSync:file=>JSON.stringify(file.endsWith('secrets.json') ? secrets : settings) };
    const context = vm.createContext({ module:{exports:{}}, __dirname:'/st/plugins/carrotsearch', require:name=>name==='fs'?fakeFs:require(name), fetch:async (url,opts)=>{ requests.push({url,opts}); return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})}; }, AbortSignal });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../plugin/support.js'),'utf8'),context);
    const {callAI}=context.module.exports;
    await callAI('u','obsolete','obsolete','prompt',[]);
    assert.equal(requests[0].url,'https://first.example/v1/chat/completions');
    assert.equal(JSON.parse(requests[0].opts.body).model,'first');
    assert.equal(requests[0].opts.headers.Authorization,'Bearer active');
    settings.oai_settings.custom_url='https://second.example/v1'; settings.oai_settings.custom_model='second';
    await callAI('u','obsolete','obsolete','prompt',[]);
    assert.equal(requests[1].url,'https://second.example/v1/chat/completions');
    assert.equal(JSON.parse(requests[1].opts.body).model,'second');
    settings.oai_settings.chat_completion_source='claude';
    await assert.rejects(callAI('u','','','prompt',[]),/自定义 OpenAI/);
});

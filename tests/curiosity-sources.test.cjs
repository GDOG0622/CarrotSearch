const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchConfiguredSource } = require('../plugin/curiosity-search');

test('dispatches each selected source and preserves its results and configuration', async () => {
    const data = {
        serpapi:{organic_results:[{title:'A',link:'https://a.test',snippet:'one'}]},
        serper:{organic:[{title:'A',link:'https://a.test',snippet:'one'}]},
        tavily:{results:[{title:'A',url:'https://a.test',content:'one'}]},
        zai:{search_result:[{title:'A',link:'https://a.test',content:'one'}]},
        koboldcpp:[{title:'A',url:'https://a.test',desc:'one'}],
        extras:{results:'one',links:['https://a.test']}, plugin:{results:'one',links:['https://a.test']},
        searxng:'<div id="urls"><article class="result"><a class="url_header" href="https://a.test"><h3>A</h3></a><p class="content">one</p></article></div>',
    };
    const settings = {textgenerationwebui_settings:{server_urls:{koboldcpp:'http://localhost:5001'}}};
    const websearch = {searxng_url:'http://localhost:8889',searxng_preferences:'pref',extras_engine:'google'};
    for (const source of Object.keys(data)) {
        const result = await searchConfiguredSource({ source, settings, websearch, query:'猫', invoke:async (chosen, body) => {
            assert.equal(chosen,source); assert.equal(body.query,'猫');
            if(source==='searxng') assert.equal(body.preferences,'pref');
            if(source==='koboldcpp') assert.equal(body.url,'http://localhost:5001');
            if(source==='extras'||source==='plugin') assert.equal(body.engine,'google');
            return data[source];
        }});
        assert.ok(result.some(item=>item.content==='one'), source);
        assert.ok(result.some(item=>item.url.replace(/\/$/,'')==='https://a.test'), source);
    }
    await assert.rejects(searchConfiguredSource({source:'unknown'}),/不支持/);
});


const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('registers a standalone CarrotSearch server plugin without Carrot backend', async () => {
    const routes = [], source = fs.readFileSync(path.join(__dirname, '../plugin/index.js'), 'utf8');
    let resumed = false;
    const curiosity = { resume: () => { resumed = true; } };
    for (const name of ['defaultsHandler','usersHandler','charsHandler','profilesHandler','modelsHandler','worldsHandler','statusHandler','revisionsHandler','editorHandler','runNowHandler','startHandler','stopHandler']) curiosity[name] = () => {};
    const dependencies = { express: { json: () => () => {} }, './curiosity': curiosity, './manifest.json': { id:'carrotsearch', name:'CarrotSearch Backend', description:'角色自主搜索后台', version:'1.4.0' } };
    const context = vm.createContext({ module:{ exports:{} }, require:name=>{if (!(name in dependencies)) throw Error(`unexpected dependency ${name}`);return dependencies[name]}, console });
    vm.runInContext(source, context);
    const plugin = context.module.exports;
    await plugin.init({ use() {}, get:route=>routes.push(`GET ${route}`), post:route=>routes.push(`POST ${route}`) });
    assert.equal(plugin.info.id,'carrotsearch');
    assert.equal(resumed,true);
    for (const route of ['GET /curiosity/users','GET /curiosity/worlds','POST /curiosity/start','POST /curiosity/run-now']) assert.ok(routes.includes(route), route);
});

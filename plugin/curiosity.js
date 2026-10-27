// Autonomous search uses independent timers and never sends chat messages.
const support = require('./support');
const { createWorldStore } = require('./curiosity-worlds');
const { searchSearxng } = require('./curiosity-search');
const { runCuriosityCheck } = require('./curiosity-run');

const timersByUser = new Map();
const statesByUser = new Map();
const lastResults = new Map();
const editorPresence = new Map();
const DEFAULT_PROMPT = '让角色以自己的好奇心探索世界。没有明确想搜索的理由时，可以选择不搜索。';

function worldIsBeingEdited(user, book) {
    const now = Date.now();
    for (const [key, entry] of editorPresence) {
        if (entry.expires < now) { editorPresence.delete(key); continue; }
        if (entry.user === user && entry.book === book) return true;
    }
    return false;
}

function stopUser(user) {
    const state = statesByUser.get(user);
    if (state) state.active = false;
    statesByUser.delete(user);
    for (const timer of timersByUser.get(user)?.values() || []) clearInterval(timer);
    timersByUser.delete(user);
}

function validateConfig(user, config, store) {
    if (!user || !support.listUsers().includes(user)) throw new Error('酒馆用户不存在');
    if (config.searchSource && config.searchSource !== 'searxng') throw new Error('自主搜索目前只支持 SearXNG，请在上方搜索设置选择 SearXNG');
    const url = new URL(config.searxngUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('SearXNG 地址无效');
    if (!Array.isArray(config.schemes)) throw new Error('搜索方案无效');
    const worlds = new Set(store.list(user));
    const availableChars = new Set(support.listChars(user));
    const ids = new Set();
    const chars = new Set();
    const assignedWorlds = new Set();
    for (const scheme of config.schemes) {
        if (!scheme.enabled) continue;
        if (!scheme.id || ids.has(scheme.id)) throw new Error('搜索方案 ID 重复或缺失');
        if (!availableChars.has(scheme.charName) || chars.has(scheme.charName)) throw new Error('角色不存在，或同一角色配置了多个方案');
        if (!worlds.has(scheme.worldBook)) throw new Error(`找不到所选世界书：${scheme.worldBook || '未选择'}`);
        if (assignedWorlds.has(scheme.worldBook)) throw new Error('请为每个角色选择独立的搜索世界书');
        if (!Number.isFinite(Number(scheme.intervalMinutes)) || Number(scheme.intervalMinutes) < 1) throw new Error('检查间隔至少为 1 分钟');
        ids.add(scheme.id);
        chars.add(scheme.charName);
        assignedWorlds.add(scheme.worldBook);
    }
}

function startUser(user, config) {
    if (!config?.enabled) { stopUser(user); return; }
    const store = createWorldStore(support.getDataDir());
    try { validateConfig(user, config, store); }
    catch (error) { stopUser(user); throw error; }
    const key = JSON.stringify(config.schemes);
    const previous = statesByUser.get(user);
    if (previous?.key === key) {
        previous.config = config;
        return;
    }
    stopUser(user);
    const state = { active: true, key, config, running: new Set(), execute: new Map() };
    statesByUser.set(user, state);
    const timers = new Map();
    for (const scheme of config.schemes.filter(s => s.enabled)) {
        const execute = async (manual = false) => {
            if (!state.active || state.running.has(scheme.id)) return { ok: false, error: '方案未运行或正在检查' };
            const current = state.config;
            if (!manual && scheme.mode === 'probability' && Math.random() * 100 >= Math.max(0, Math.min(100, Number(scheme.probability) || 0))) return { ok: true, searched: false };
            if (worldIsBeingEdited(user, scheme.worldBook)) {
                lastResults.set(`${user}:${scheme.id}`, { time: new Date().toISOString(), ok: false, error: '世界书正在编辑，本次检查跳过' });
                return { ok: false, error: '世界书正在编辑，本次检查跳过' };
            }
            state.running.add(scheme.id);
            try {
                const websearch = support.loadSettings(user)?.extension_settings?.websearch || {};
                const effective = { ...current, searxngUrl: websearch.searxng_url ?? current.searxngUrl, searxngPreferences: websearch.searxng_preferences ?? current.searxngPreferences, searchSource: websearch.source ?? current.searchSource };
                if (effective.searchSource && effective.searchSource !== 'searxng') throw new Error('自主搜索目前只支持 SearXNG，请在上方搜索设置选择 SearXNG');
                const result = await runCuriosityCheck({
                    user, config: effective, scheme,
                    loadCard: support.loadCharCard,
                    loadWorld: (u, b) => store.read(u, b),
                    callAI: support.callAI,
                    search: searchSearxng,
                    save: (u, b, record) => {
                        if (!state.active) throw new Error('方案已停止，搜索结果未保存');
                        if (worldIsBeingEdited(u, b)) throw new Error('世界书正在编辑，本次未写入');
                        return store.append(u, b, record);
                    },
                });
                lastResults.set(`${user}:${scheme.id}`, { time: new Date().toISOString(), ok: true, searched: result.searched });
                return { ok: true, searched: result.searched };
            } catch (error) {
                lastResults.set(`${user}:${scheme.id}`, { time: new Date().toISOString(), ok: false, error: String(error.message || error).slice(0, 200) });
                console.warn(`[carrotsearch-plugin] 自主搜索「${scheme.charName}」失败：${error.message}`);
                return { ok: false, error: String(error.message || error) };
            } finally { state.running.delete(scheme.id); }
        };
        state.execute.set(scheme.id, execute);
        const timer = setInterval(execute, Math.max(1, Number(scheme.intervalMinutes)) * 60000);
        timers.set(scheme.id, timer);
    }
    timersByUser.set(user, timers);
}

function resume() {
    for (const user of support.listUsers()) {
        try {
            const config = support.loadSettings(user)?.extension_settings?.websearch?.curiosity;
            const websearch = support.loadSettings(user)?.extension_settings?.websearch || {};
            if (config?.enabled) startUser(user, { ...config, searxngUrl: websearch.searxng_url ?? config.searxngUrl, searxngPreferences: websearch.searxng_preferences ?? config.searxngPreferences, searchSource: websearch.source });
        } catch (error) { console.warn(`[carrotsearch-plugin] 无法恢复自主搜索：${error.message}`); }
    }
}

function defaultsHandler(_req, res) { res.json({ ok: true, customPrompt: DEFAULT_PROMPT }); }
function allowUser(req, user) {
    const profile = req.user?.profile;
    return !!profile && profile.handle === user;
}
function usersHandler(req, res) {
    const profile = req.user?.profile;
    if (!profile) return res.status(403).json({ ok: false, error: '未登录' });
    return res.json({ ok: true, users: [profile.handle] });
}
function charsHandler(req, res) {
    const user = String(req.query.user || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权查看该用户的角色' });
    try { return res.json({ ok: true, chars: support.listChars(user) }); }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
}
function profilesHandler(req, res) {
    const user = String(req.query.user || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权查看该用户的 API 方案' });
    try { return res.json({ ok: true, profiles: support.listProfiles(user) }); }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
}
async function modelsHandler(req, res) {
    const user = String(req.query.user || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权查看该用户的模型' });
    try { return res.json({ ok: true, models: await support.listModels(user, String(req.query.profileId || '')) }); }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
}
function worldsHandler(req, res) {
    const user = String(req.query.user || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权访问该用户的世界书' });
    try { res.json({ ok: true, worlds: createWorldStore(support.getDataDir()).list(user) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
}
function startHandler(req, res) {
    try {
        const config = req.body || {};
        const user = String(config.stUser || '');
        if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权修改该用户的自主搜索' });
        startUser(user, config);
        res.json({ ok: true, running: timersByUser.get(user)?.size || 0 });
    } catch (error) { res.status(400).json({ ok: false, error: error.message }); }
}
function stopHandler(req, res) {
    const user = String(req.body?.stUser || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权修改该用户的自主搜索' });
    stopUser(user); res.json({ ok: true });
}
function statusHandler(req, res) {
    const user = String(req.query.user || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权查看该用户的自主搜索' });
    const state = statesByUser.get(user);
    const results = (state?.config?.schemes || []).map(s => ({ id: s.id, ...lastResults.get(`${user}:${s.id}`) }));
    res.json({ ok: true, running: timersByUser.get(user)?.size || 0, results });
}

function revisionsHandler(req, res) {
    const user = String(req.body?.stUser || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权查看该用户的世界书' });
    const books = Array.isArray(req.body?.books) ? req.body.books.slice(0, 100) : [];
    const store = createWorldStore(support.getDataDir());
    const revisions = {};
    for (const book of books) {
        try { revisions[book] = store.revision(user, book); } catch { revisions[book] = null; }
    }
    return res.json({ ok: true, revisions });
}

async function runNowHandler(req, res) {
    const user = String(req.body?.stUser || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权运行该用户的自主搜索' });
    const execute = statesByUser.get(user)?.execute.get(req.body?.id);
    if (!execute) return res.status(400).json({ ok: false, error: '请先启用自主搜索和角色方案并完成同步' });
    const result = await execute(true);
    return result.ok ? res.json(result) : res.status(400).json(result);
}

function editorHandler(req, res) {
    const user = String(req.body?.stUser || '');
    if (!allowUser(req, user)) return res.status(403).json({ ok: false, error: '无权修改该用户的编辑状态' });
    const client = String(req.body?.client || '');
    if (!/^[A-Za-z0-9-]{1,100}$/.test(client)) return res.status(400).json({ ok: false, error: '客户端标识无效' });
    const book = typeof req.body?.book === 'string' ? req.body.book : '';
    const now = Date.now();
    for (const entry of editorPresence.values()) {
        if (entry.user === user && entry.client === client && entry.book !== book && !entry.closing) {
            entry.closing = true;
            entry.expires = now + 15000; // Allow ST's debounced editor save to finish.
        }
    }
    if (book) editorPresence.set(`${user}:${client}:${book}`, { user, client, book, closing: false, expires: now + 45000 });
    return res.json({ ok: true });
}

module.exports = { defaultsHandler, usersHandler, charsHandler, profilesHandler, modelsHandler, worldsHandler, startHandler, stopHandler, statusHandler, revisionsHandler, runNowHandler, editorHandler, resume, startUser, stopUser };

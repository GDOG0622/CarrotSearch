// CarrotSearch backend helpers: ST users, characters and connection profiles.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function getStRoot() {
    return path.resolve(__dirname, '..', '..');
}

function getDataDir() {
    return path.join(getStRoot(), 'data');
}

function listUsers() {
    const dataDir = getDataDir();
    try {
        return fs.readdirSync(dataDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
            .map((entry) => entry.name);
    } catch {
        return [];
    }
}

function getUserDir(user) {
    if (!user || typeof user !== 'string' || user.includes('..') || path.isAbsolute(user)) {
        throw new Error('非法用户名');
    }
    const dir = path.join(getDataDir(), user);
    if (!fs.existsSync(dir)) {
        throw new Error(`用户目录不存在：${user}`);
    }
    return dir;
}

// ───────────── char 卡 ─────────────

function listChars(user) {
    const dir = path.join(getUserDir(user), 'characters');
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && /\.(png|json)$/i.test(entry.name))
            .map((entry) => entry.name.replace(/\.(png|json)$/i, ''))
            .filter((name, index, arr) => arr.indexOf(name) === index);
    } catch {
        return [];
    }
}

// 从 PNG 的 tEXt/iTXt chunk 里取 chara 字段（base64 JSON），零依赖手写 PNG chunk 解析
function extractPngCharaText(buffer) {
    if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) {
        throw new Error('不是有效的 PNG 文件');
    }
    let offset = 8;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (type === 'tEXt') {
            const chunk = buffer.slice(dataStart, dataEnd);
            const nullIndex = chunk.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = chunk.toString('latin1', 0, nullIndex);
                if (keyword === 'chara') {
                    return chunk.toString('latin1', nullIndex + 1);
                }
            }
        } else if (type === 'iTXt') {
            const chunk = buffer.slice(dataStart, dataEnd);
            const nullIndex = chunk.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = chunk.toString('latin1', 0, nullIndex);
                if (keyword === 'chara') {
                    // iTXt: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
                    let p = nullIndex + 1;
                    p += 2; // compression flag + method
                    const langEnd = chunk.indexOf(0, p);
                    p = langEnd + 1;
                    const transEnd = chunk.indexOf(0, p);
                    p = transEnd + 1;
                    return chunk.toString('utf8', p, chunk.length);
                }
            }
        }
        offset = dataEnd + 4; // 跳过 CRC
        if (type === 'IEND') break;
    }
    throw new Error('PNG 中未找到 chara 元数据');
}

function normalizeCardFields(raw) {
    const data = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
    return {
        name: data?.name || '',
        description: data?.description || '',
        personality: data?.personality || '',
        scenario: data?.scenario || '',
        mes_example: data?.mes_example || '',
        first_mes: data?.first_mes || '',
    };
}

function loadCharCard(user, charName) {
    const dir = path.join(getUserDir(user), 'characters');
    const pngPath = path.join(dir, `${charName}.png`);
    const jsonPath = path.join(dir, `${charName}.json`);

    if (fs.existsSync(pngPath)) {
        const buffer = fs.readFileSync(pngPath);
        const text = extractPngCharaText(buffer);
        const json = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
        return normalizeCardFields(json);
    }
    if (fs.existsSync(jsonPath)) {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        return normalizeCardFields(json);
    }
    throw new Error(`未找到 char 卡：${charName}`);
}

function loadSettings(user) {
    const file = path.join(getUserDir(user), 'settings.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listProfiles(user) {
    try {
        const settings = loadSettings(user);
        const profiles = settings?.extension_settings?.connectionManager?.profiles || [];
        return profiles.map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch {
        return [];
    }
}

function loadSecretValueById(user, secretId) {
    const file = path.join(getUserDir(user), 'secrets.json');
    const secrets = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of Object.keys(secrets)) {
        const arr = secrets[key];
        if (!Array.isArray(arr)) continue;
        const found = arr.find((s) => s.id === secretId);
        if (found) return found.value;
    }
    return null;
}

// 只解析连接信息（url/key），不强制要求 profile 自带模型——
// 模型允许由自主搜索设置中的 apiModel 覆盖。
function resolveApiConnection(user, profileId) {
    const settings = loadSettings(user);
    const profiles = settings?.extension_settings?.connectionManager?.profiles || [];
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('未找到指定的 API 方案，请检查是否已在酒馆的「连接管理」里保存该方案');

    const apiUrl = profile['api-url'];
    if (!apiUrl) {
        throw new Error('该 API 方案没有配置自定义 Server URL，自主搜索目前只支持带自定义 URL 的方案，请在连接管理里配置');
    }

    let apiKey = '';
    if (profile['secret-id']) {
        apiKey = loadSecretValueById(user, profile['secret-id']) || '';
    }

    return { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey, profileModel: profile.model || '' };
}

async function listModels(user, profileId) {
    const { apiUrl, apiKey } = resolveApiConnection(user, profileId);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${apiUrl}/models`, { headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`拉取模型列表失败 (${res.status})：${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
}


// Run ST's own search endpoint with the current user's directories, without a browser session.
async function invokeSearch(user, source, body, settings) {
    if (source === 'extras') {
        const ext = settings.extension_settings || {};
        if (!ext.apiUrl) throw new Error('请先配置 Extras API 地址');
        const headers = { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'bypass' };
        if (ext.apiKey) headers.Authorization = `Bearer ${ext.apiKey}`;
        const response = await fetch(new URL('/api/websearch', ext.apiUrl), { method:'POST', headers, body:JSON.stringify(body), signal:AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`Extras 搜索失败（HTTP ${response.status}）`);
        return response.json();
    }
    const stRoot = getStRoot();
    let handler;
    if (source === 'plugin') {
        const pluginsDir = path.join(stRoot, 'plugins');
        const folder = fs.readdirSync(pluginsDir, { withFileTypes:true }).find(entry => entry.isDirectory() && /selenium/i.test(entry.name));
        if (!folder) throw new Error('请先安装并启用 Selenium 搜索服务端插件');
        const dir = path.join(pluginsDir, folder.name);
        let main = 'index.js';
        try { main = JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).main || main; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const plugin = await import(pathToFileURL(path.resolve(dir, main)).href);
        const info = plugin.info || plugin.default?.info;
        const init = plugin.init || plugin.default?.init;
        if (info?.id !== 'selenium' || typeof init !== 'function') throw new Error('Selenium 插件无效');
        await init({ post(route, ...handlers) { if (route === '/search') handler = handlers.at(-1); } });
    } else {
        const mod = await import(pathToFileURL(path.join(stRoot,'src','endpoints','search.js')).href);
        handler = mod.router?.stack?.find(layer => layer.route?.path === `/${source}`)?.route?.stack?.at(-1)?.handle;
    }
    if (typeof handler !== 'function') throw new Error(`酒馆未提供 ${source} 搜索接口`);
    const users = await import(pathToFileURL(path.join(stRoot,'src','users.js')).href);
    return new Promise((resolve, reject) => {
        let status = 200;
        const response = {
            status(code) { status = code; return this; },
            sendStatus(code) { status = code; return this.send(''); },
            json(value) { return this.send(value); },
            send(value) { if (status >= 400) reject(new Error(`${source} 搜索失败（HTTP ${status}）`)); else resolve(value); return this; },
        };
        Promise.resolve(handler({ body, user:{ profile:{ handle:user }, directories:users.getUserDirectories(user) } }, response)).catch(reject);
    });
}

// ───────────── AI 调用 ─────────────

async function callAI(user, profileId, model, systemPrompt, messages, { jsonMode = false, signal } = {}) {
    const settings = loadSettings(user);
    const current = settings.oai_settings || {};
    if (settings.main_api !== 'openai' || current.chat_completion_source !== 'custom') {
        throw new Error('自主搜索目前只支持酒馆的自定义 OpenAI 兼容连接');
    }
    const apiUrl = String(current.custom_url || '').replace(/\/+$/, '');
    const finalModel = current.custom_model;
    if (!apiUrl || !finalModel) throw new Error('请先在酒馆 API 连接中设置自定义地址和模型');
    let secrets = {};
    try { secrets = JSON.parse(fs.readFileSync(path.join(getUserDir(user), 'secrets.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const apiKey = secrets.api_key_custom?.find?.(secret => secret.active)?.value || '';

    const body = {
        model: finalModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.9,
    };
    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI 请求失败 (${res.status})：${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI 返回结果格式异常');
    return content;
}


module.exports = { invokeSearch, getDataDir, listUsers, listChars, loadCharCard, loadSettings, listProfiles, listModels, resolveApiConnection, callAI };

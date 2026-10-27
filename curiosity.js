import { extension_settings } from '../../../extensions.js';
import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';

const API = '/api/plugins/carrotsearch';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const option = (value, label, selected) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`;

async function request(url, body) {
    const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

export function initCuriosity() {
    const container = document.getElementById('curiosity-container');
    if (!container) return;
    const config = extension_settings.websearch.curiosity;
    let users = [], chars = [], worlds = [], profiles = [], models = [], status = '';
    let timer = null, revision = 0, queue = Promise.resolve(), promptReady = false;
    const bookRevisions = new Map();
    const warnedBooks = new Set();
    let cacheSyncRunning = false;
    const editing = new Set();
    const makeId = () => globalThis.crypto?.randomUUID?.() || `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientId = makeId();
    let heartbeatTimer;

    function selectedWorldBook() {
        const select = document.getElementById('world_editor_select');
        // ST stores the book's index in the option value; the visible option text is its name.
        return select?.value ? String(select.selectedOptions[0]?.textContent || '').trim() : '';
    }

    async function updateEditorPresence() {
        if (!config.stUser) return;
        const editor = document.getElementById('world_popup');
        const selected = selectedWorldBook();
        const matches = config.schemes.some(scheme => scheme.worldBook === selected);
        const book = editor?.getClientRects().length && matches ? selected : '';
        try { await request(`${API}/curiosity/editor`, { stUser: config.stUser, client: clientId, book }); }
        catch (error) { console.warn('[carrotsearch] 无法同步世界书编辑状态', error); }
    }
    function scheduleEditorPresence() {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(updateEditorPresence, 200);
    }

    function updateStatus(value) {
        status = value;
        const element = container.querySelector('#cip-curiosity-status');
        if (element) element.textContent = value;
    }
    function persist() {
        saveSettingsDebounced();
        clearTimeout(timer);
        const current = ++revision;
        timer = setTimeout(() => {
            const snapshot = JSON.parse(JSON.stringify(config));
            if (!snapshot.stUser) { updateStatus('请先选择酒馆用户'); return; }
            if (snapshot.enabled && !promptReady) { updateStatus('请安装 CarrotSearch 后端并重启酒馆'); return; }
            updateStatus('正在同步…');
            queue = queue.then(async () => {
                if (current !== revision) return;
                try {
                    const data = await request(`${API}/curiosity/${snapshot.enabled ? 'start' : 'stop'}`, snapshot);
                    if (current === revision) updateStatus(snapshot.enabled ? `已同步，运行 ${data.running} 个方案` : '自主搜索已关闭');
                } catch (error) { if (current === revision) updateStatus(`同步失败：${error.message}`); }
            });
        }, 500);
    }
    async function loadUserData() {
        if (!config.stUser) return;
        const user = encodeURIComponent(config.stUser);
        const settled = await Promise.allSettled([
            request(`${API}/curiosity/chars?user=${user}`),
            request(`${API}/curiosity/worlds?user=${user}`),
            request(`${API}/curiosity/profiles?user=${user}`),
        ]);
        chars = settled[0].status === 'fulfilled' ? settled[0].value.chars || [] : [];
        worlds = settled[1].status === 'fulfilled' ? settled[1].value.worlds || [] : [];
        profiles = settled[2].status === 'fulfilled' ? settled[2].value.profiles || [] : [];
        const failed = settled.find(item => item.status === 'rejected');
        if (failed) updateStatus(`读取设置失败：${failed.reason.message}`);
    }
    async function syncWorldCaches() {
        if (cacheSyncRunning || !config.stUser) return;
        const books = [...new Set(config.schemes.map(item => item.worldBook).filter(Boolean))];
        if (!books.length) return;
        cacheSyncRunning = true;
        try {
            const data = await request(`${API}/curiosity/revisions`, { stUser: config.stUser, books });
            const { worldInfoCache } = await import('../../../world-info.js');
            for (const book of books) {
                const current = data.revisions?.[book];
                const previous = bookRevisions.get(book);
                if (!current || previous === current) continue;
                const editor = document.getElementById('world_popup');
                const selected = selectedWorldBook();
                if (editor?.getClientRects().length && selected === book) {
                    const message = `世界书「${book}」已在后台更新；请先关闭编辑器并刷新页面后再编辑，避免旧内容覆盖新记录。`;
                    updateStatus(message);
                    if (!warnedBooks.has(book)) {
                        globalThis.toastr?.warning?.(message, '自主搜索');
                        warnedBooks.add(book);
                    }
                    continue;
                }
                worldInfoCache?.delete(book);
                bookRevisions.set(book, current);
                warnedBooks.delete(book);
            }
        } catch (error) {
            console.warn('[carrotsearch] 自主搜索世界书缓存同步失败', error);
        } finally { cacheSyncRunning = false; }
    }
    function renderScheme(scheme) {
        const card = document.createElement('div');
        card.className = 'websearch-curiosity-field';
        card.style.cssText = 'border:1px solid rgba(128,128,128,.3);border-radius:8px;padding:10px;margin-bottom:10px;';
        const isEditing = editing.has(scheme.id);
        if (!isEditing) {
            card.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.5em"><label class="checkbox_label"><input class="cur-enabled" type="checkbox" ${scheme.enabled ? 'checked' : ''}><b>${escape(scheme.charName || '未选择角色')}</b></label><small>${escape(scheme.worldBook || '未选择世界书')} · 每 ${escape(scheme.intervalMinutes)} 分钟</small><button class="menu_button cur-run">立即检查</button><button class="menu_button cur-edit">编辑</button><button class="menu_button cur-delete">删除</button></div>`;
            card.querySelector('.cur-enabled').onchange = e => { scheme.enabled = e.target.checked; persist(); };
            card.querySelector('.cur-edit').onclick = () => { editing.add(scheme.id); render(); };
            card.querySelector('.cur-run').onclick = async event => {
                const button = event.currentTarget;
                button.disabled = true;
                updateStatus('正在检查，由 AI 决定是否搜索…');
                try {
                    const result = await request(`${API}/curiosity/run-now`, { stUser: config.stUser, id: scheme.id });
                    updateStatus(result.searched ? '已完成搜索并保存到世界书' : '角色这次决定不搜索');
                    await syncWorldCaches();
                } catch (error) { updateStatus(`检查失败：${error.message}`); }
                finally { button.disabled = false; }
            };
            card.querySelector('.cur-delete').onclick = () => {
                if (!confirm(`删除「${scheme.charName || '未选择角色'}」的自主搜索方案？`)) return;
                config.schemes = config.schemes.filter(item => item.id !== scheme.id); persist(); render();
            };
            return card;
        }
        const draft = { ...scheme };
        const used = new Set(config.schemes.filter(item => item.id !== scheme.id).map(item => item.charName));
        card.innerHTML = `<div class="websearch-curiosity-field"><small>角色</small><select class="text_pole cur-char">${option('', '选择角色…', draft.charName)}${chars.filter(name => name === draft.charName || !used.has(name)).map(name => option(name, name, draft.charName)).join('')}</select></div>
            <div class="websearch-curiosity-field"><small>该角色的搜索世界书</small><select class="text_pole cur-world">${option('', '选择已有世界书…', draft.worldBook)}${worlds.map(name => option(name, name, draft.worldBook)).join('')}</select><small>请同时在 ST 里将这本世界书绑定到该角色，摘要才能在聊天中按关键词触发。</small></div>
            <div class="websearch-curiosity-field"><small>检查间隔（分钟）</small><input class="text_pole cur-interval" type="number" min="1" value="${escape(draft.intervalMinutes)}"></div>
            <div class="websearch-curiosity-field"><small>触发方式</small><select class="text_pole cur-mode">${option('ai', '每次由 AI 判断', draft.mode)}${option('probability', '先按概率筛选，再由 AI 判断', draft.mode)}</select></div>
            <div class="websearch-curiosity-field cur-probability-row" ${draft.mode === 'probability' ? '' : 'hidden'}><small>检查概率（%）</small><input class="text_pole cur-probability" type="number" min="0" max="100" value="${escape(draft.probability)}"></div>
            <div style="display:flex;gap:.5em;justify-content:flex-end"><button class="menu_button cur-cancel">取消</button><button class="menu_button cur-save">保存</button></div>`;
        card.querySelector('.cur-char').onchange = e => { draft.charName = e.target.value; };
        card.querySelector('.cur-world').onchange = e => { draft.worldBook = e.target.value; };
        card.querySelector('.cur-interval').onchange = e => { draft.intervalMinutes = Math.max(1, Number(e.target.value) || 60); };
        card.querySelector('.cur-mode').onchange = e => { draft.mode = e.target.value; card.querySelector('.cur-probability-row').hidden = draft.mode !== 'probability'; };
        card.querySelector('.cur-probability').onchange = e => { draft.probability = Math.min(100, Math.max(0, Number(e.target.value) || 0)); };
        card.querySelector('.cur-save').onclick = () => {
            if (!draft.charName || !draft.worldBook) { alert('请选择角色和搜索世界书'); return; }
            const index = config.schemes.findIndex(item => item.id === scheme.id);
            if (index >= 0) config.schemes[index] = draft;
            editing.delete(scheme.id); persist(); render();
        };
        card.querySelector('.cur-cancel').onclick = () => {
            if (!scheme.charName) config.schemes = config.schemes.filter(item => item.id !== scheme.id);
            editing.delete(scheme.id); persist(); render();
        };
        return card;
    }
    function render() {
        container.innerHTML = `<label class="checkbox_label"><input id="cip-curiosity-enabled" type="checkbox" ${config.enabled ? 'checked' : ''}>启用自主搜索</label>
            <small>自主搜索需要独立的 CarrotSearch 服务端插件。<a href="https://github.com/GDOG0622/CarrotSearch#角色自主搜索" target="_blank" rel="noopener noreferrer">查看安装说明</a></small>
            <div class="websearch-curiosity-field"><small>酒馆用户</small><select id="cip-curiosity-user" class="text_pole">${users.map(user => option(user, user, config.stUser)).join('')}</select></div>
            <div class="websearch-curiosity-field"><small>API 方案</small><select id="cip-curiosity-profile" class="text_pole">${option('', '选择 API 方案…', config.apiProfileId)}${profiles.map(item => option(item.id, item.name, config.apiProfileId)).join('')}</select></div>
            <div class="websearch-curiosity-field"><small>模型（可选，不选则使用方案自带模型）</small><div style="display:flex;gap:.4em"><select id="cip-curiosity-model" class="text_pole" style="flex:1;min-width:0">${option('', '使用方案自带模型', config.apiModel)}${models.map(model => option(model, model, config.apiModel)).join('')}${config.apiModel && !models.includes(config.apiModel) ? option(config.apiModel, config.apiModel, config.apiModel) : ''}</select><button id="cip-curiosity-load-models" class="menu_button">拉取模型</button></div></div>
            <div class="websearch-curiosity-field"><small>SearXNG 服务地址</small><input id="cip-curiosity-url" class="text_pole" type="url" placeholder="http://127.0.0.1:8889"><small>填写酒馆服务器可访问的地址；与酒馆在同一台服务器时可使用本机地址。</small></div>
            <div class="websearch-curiosity-field"><small>SearXNG 偏好设置字符串（可留空）</small><input id="cip-curiosity-preferences" class="text_pole"></div>
            <div class="websearch-curiosity-field"><small>自定义提示词</small><textarea id="cip-curiosity-prompt" class="text_pole" rows="5" ${promptReady ? '' : 'disabled'}></textarea></div>
            <div id="cip-curiosity-schemes"></div><button id="cip-curiosity-add" class="menu_button">+ 添加角色搜索方案</button>
            <div id="cip-curiosity-status" role="status"></div><button id="cip-curiosity-check" class="menu_button">查看运行状态</button>`;
        container.querySelector('#cip-curiosity-url').value = config.searxngUrl || '';
        container.querySelector('#cip-curiosity-preferences').value = config.searxngPreferences || '';
        container.querySelector('#cip-curiosity-prompt').value = config.customPrompt || '';
        updateStatus(status);
        const list = container.querySelector('#cip-curiosity-schemes');
        for (const scheme of config.schemes) list.append(renderScheme(scheme));
        container.querySelector('#cip-curiosity-enabled').onchange = e => { config.enabled = e.target.checked; if (config.enabled) delete config.migratedFromCarrot; persist(); };
        container.querySelector('#cip-curiosity-user').onchange = async e => {
            const old = config.stUser;
            if (old && old !== e.target.value) { try { await request(`${API}/curiosity/stop`, { stUser: old }); } catch (error) { e.target.value = old; updateStatus(`旧用户方案停止失败：${error.message}`); return; } }
            config.stUser = e.target.value; config.apiProfileId = ''; config.apiModel = ''; models = []; await loadUserData(); persist(); render();
        };
        container.querySelector('#cip-curiosity-profile').onchange = e => { config.apiProfileId = e.target.value; config.apiModel = ''; models = []; persist(); render(); };
        container.querySelector('#cip-curiosity-model').onchange = e => { config.apiModel = e.target.value; persist(); };
        container.querySelector('#cip-curiosity-load-models').onclick = async () => {
            if (!config.apiProfileId) { updateStatus('请先选择 API 方案'); return; }
            try { const data = await request(`${API}/curiosity/models?user=${encodeURIComponent(config.stUser)}&profileId=${encodeURIComponent(config.apiProfileId)}`); models = data.models || []; updateStatus(`已读取 ${models.length} 个模型`); render(); }
            catch (error) { updateStatus(`拉取模型失败：${error.message}`); }
        };
        for (const [selector, key] of [['#cip-curiosity-url', 'searxngUrl'], ['#cip-curiosity-preferences', 'searxngPreferences'], ['#cip-curiosity-prompt', 'customPrompt']]) {
            container.querySelector(selector).oninput = e => { config[key] = e.target.value; persist(); };
        }
        container.querySelector('#cip-curiosity-add').onclick = () => {
            const scheme = { id: makeId(), enabled: false, charName: '', worldBook: '', intervalMinutes: 60, mode: 'ai', probability: 50 };
            config.schemes.push(scheme); editing.add(scheme.id); render();
        };
        container.querySelector('#cip-curiosity-check').onclick = async () => {
            try {
                const data = await request(`${API}/curiosity/status?user=${encodeURIComponent(config.stUser)}`);
                const messages = (data.results || []).filter(item => item.time).map(item => {
                    const charName = config.schemes.find(scheme => scheme.id === item.id)?.charName || '角色';
                    return `${charName}：${item.ok ? (item.searched ? '已完成一次搜索' : '上次决定不搜索') : `上次失败：${item.error}`}（${new Date(item.time).toLocaleString()}）`;
                });
                updateStatus(`运行 ${data.running} 个方案${messages.length ? `；${messages.join('；')}` : '；尚无检查记录'}`);
            } catch (error) { updateStatus(`读取状态失败：${error.message}`); }
        };
    }
    (async () => {
        try {
            const [userData, defaults] = await Promise.all([request(`${API}/curiosity/users`), request(`${API}/curiosity/defaults`)]);
            users = userData.users || [];
            if (!config.stUser || !users.includes(config.stUser)) config.stUser = users[0] || '';
            if (typeof config.customPrompt !== 'string') { config.customPrompt = defaults.customPrompt; saveSettingsDebounced(); }
            promptReady = true;
            await loadUserData();
            if (config.migratedFromCarrot) updateStatus('已保留之前的自主搜索配置；请核对后手动启用。');
            render();
            if (config.enabled) persist();
            const context = globalThis.SillyTavern?.getContext?.();
            const generationEvent = context?.eventTypes?.GENERATION_STARTED;
            if (generationEvent) context.eventSource.on(generationEvent, syncWorldCaches);
            setInterval(syncWorldCaches, 15000);
            setInterval(updateEditorPresence, 5000);
            document.addEventListener('click', scheduleEditorPresence);
            document.addEventListener('change', scheduleEditorPresence);
            document.addEventListener('visibilitychange', scheduleEditorPresence);
            updateEditorPresence();
            syncWorldCaches();
        } catch (error) { updateStatus(`无法加载自主搜索：${error.message}；请先安装或更新 CarrotSearch 后端并重启酒馆`); render(); }
    })();
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export function extractSearchHistory(world) {
    const records = [];
    for (const entry of Object.values(world?.entries || {})) {
        if (entry?.carrotSearch?.source !== 'carrot-autonomous-search' || entry.carrotSearch.type !== 'detail') continue;
        const text = String(entry.content || '');
        const timestamp = String(entry.carrotSearch.timestamp || text.match(/^搜索时间：(.+)$/m)?.[1] || '');
        const query = text.match(/^搜索词：(.+)$/m)?.[1] || '';
        const pattern = /(?:^|\n)(\d+)\. ([^\n]*)\n链接：([^\n]*)\n内容：/g;
        for (const match of text.matchAll(pattern)) {
            try {
                const url = new URL(match[3].trim());
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
                records.push({ title: match[2].trim() || url.hostname, url: url.href, timestamp, query });
            } catch { /* Ignore records without a usable web link. */ }
        }
    }
    return records.sort((a,b) => b.timestamp.localeCompare(a.timestamp));
}

export function initSearchHistory(container, config, request) {
    if (!container) return { render() {}, async refresh() {} };
    let selected = '', records = [], message = '', version = 0, lastBook = '';
    const schemes = () => config.schemes.filter(s => s.id && s.charName && s.worldBook);
    const current = () => schemes().find(s => s.id === selected);
    function draw() {
        const available = schemes();
        if (!available.some(s => s.id === selected)) selected = available[0]?.id || '';
        const active = current();
        const picker = available.length ? `<details class="carrotsearch-history-picker"><summary aria-label="切换角色" title="切换角色"><img src="/thumbnail?type=avatar&amp;file=${encodeURIComponent(active.charName + '.png')}" alt="${escape(active.charName)}"><span class="carrotsearch-history-avatar-fallback">${escape(active.charName.slice(0,1))}</span></summary><div class="carrotsearch-history-menu">${available.map(s => `<button type="button" data-history-role="${escape(s.id)}" aria-pressed="${s.id === selected}"><img src="/thumbnail?type=avatar&amp;file=${encodeURIComponent(s.charName + '.png')}" alt=""><span>${escape(s.charName)}</span></button>`).join('')}</div></details>` : '';
        let previous = '';
        const rows = records.map(item => {
            const date = item.timestamp.slice(0,10) || '日期未知';
            const heading = date !== previous ? `<div class="carrotsearch-history-date">${escape(date)}</div>` : '';
            previous = date;
            const time = item.timestamp.match(/\b(\d{2}:\d{2})/)?.[1] || '';
            const favicon = new URL('/favicon.ico', item.url).href;
            return `${heading}<a class="carrotsearch-history-row" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer" title="${escape(item.url)}"><span class="carrotsearch-history-icon" aria-hidden="true"><span>◎</span><img src="${escape(favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span><span class="carrotsearch-history-title">${escape(item.title)}</span><time>${escape(time)}</time></a>`;
        }).join('');
        container.innerHTML = `<div class="carrotsearch-history-header"><strong>历史记录</strong>${picker}</div><div class="carrotsearch-history-list">${message ? `<div class="carrotsearch-history-empty">${escape(message)}</div>` : rows || `<div class="carrotsearch-history-empty">${active ? '这个角色还没有搜索记录' : '添加角色搜索方案后，可在这里查看历史记录'}</div>`}</div>`;
        container.querySelectorAll('img').forEach(img => { img.onerror = () => { img.style.display = 'none'; }; });
        container.querySelectorAll('[data-history-role]').forEach(button => button.onclick = () => { selected = button.dataset.historyRole; records = []; lastBook = ''; refresh(); });
    }
    async function refresh() {
        const active = current();
        if (!active) { ++version; records = []; message = ''; draw(); return; }
        const seq = ++version;
        try {
            const data = await request('/api/worldinfo/get', { name: active.worldBook });
            if (seq !== version || current()?.id !== active.id || current()?.worldBook !== active.worldBook) return;
            records = extractSearchHistory(data); message = ''; lastBook = active.worldBook;
        } catch (error) {
            if (seq !== version) return;
            records = []; message = `无法读取搜索记录：${error.message}`;
        }
        draw();
    }
    function render() {
        const active = current();
        if (!active) { selected = schemes()[0]?.id || ''; }
        const book = current()?.worldBook || '';
        if (book !== lastBook) { records = []; message = ''; draw(); refresh(); }
        else draw();
    }
    render();
    return { render, refresh };
}

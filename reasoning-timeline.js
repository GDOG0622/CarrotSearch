// Presentation only: the ST chat, reasoning and tool invocation records are never modified.
let pendingTool = null;
let refreshTimeline = () => {};

export function setPendingTool(name, args) {
    pendingTool = name ? { name, parameters: args } : null;
    refreshTimeline();
}

const isToolMessage = message => Array.isArray(message?.extra?.tool_invocations) && message.extra.tool_invocations.length > 0;
const isAssistant = message => message && !message.is_user && !message.is_system;
const isReasoningOnly = message => isAssistant(message) && ['', '...'].includes(String(message.mes ?? '').trim())
    && !message.extra?.file && !message.extra?.files?.length && !message.extra?.media?.length;

/** Find only consecutive tool records and their adjacent reasoning-only messages. */
export function collectTimelineGroups(chat) {
    const groups = [];
    let i = 0;
    while (i < chat.length) {
        if (!isToolMessage(chat[i])) { i++; continue; }
        let start = i;
        while (start > 0 && isReasoningOnly(chat[start - 1])) start--;
        let end = i;
        while (end + 1 < chat.length && (isToolMessage(chat[end + 1]) || isReasoningOnly(chat[end + 1]))) end++;
        if (end + 1 < chat.length && isAssistant(chat[end + 1])) end++;
        groups.push({ start, end, anchor: end });
        i = end + 1;
    }
    return groups;
}

function parseValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
}

function safeUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
}

function appendText(parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.append(node);
    return node;
}

function createToolCard(call, pending = false) {
    const params = parseValue(call.parameters) || {};
    const result = parseValue(call.result);
    const search = call.name === 'WebSearch';
    const visit = call.name === 'VisitLinks';
    const card = document.createElement('div');
    card.className = 'carrotsearch-tool-card';
    const title = search ? '网页搜索' : visit ? '访问网页' : String(call.displayName || call.name || '工具调用');
    appendText(card, 'div', 'carrotsearch-tool-title', `✦ ${title}`);
    if (search && params.query) appendText(card, 'div', 'carrotsearch-tool-query', String(params.query));
    if (visit && Array.isArray(params.links)) appendText(card, 'div', 'carrotsearch-tool-query', `${params.links.length} 个链接`);
    if (pending) {
        appendText(card, 'div', 'carrotsearch-tool-status', search ? '正在搜索…' : '正在访问…');
        return card;
    }
    if (call.error) {
        appendText(card, 'div', 'carrotsearch-tool-status carrotsearch-tool-error', '调用失败');
    } else if (search && result && typeof result === 'object' && !result.text && !result.links?.length) {
        appendText(card, 'div', 'carrotsearch-tool-status', '未返回搜索结果');
    } else {
        appendText(card, 'div', 'carrotsearch-tool-status', '已完成');
    }

    const details = document.createElement('details');
    details.className = 'carrotsearch-result';
    appendText(details, 'summary', '', search ? '查看搜索结果' : '查看结果');
    let links = [];
    let content = '';
    if (search && result && typeof result === 'object') {
        links = Array.isArray(result.links) ? result.links : [];
        content = typeof result.text === 'string' ? result.text : '';
    } else if (visit && Array.isArray(result)) {
        links = result.map(item => item?.link).filter(Boolean);
        content = result.map(item => typeof item?.text === 'string' ? item.text : '').filter(Boolean).join('\n\n');
    } else if (typeof result === 'string') {
        content = result;
    } else if (result != null) {
        content = JSON.stringify(result, null, 2);
    }
    let shownLinks = 0;
    for (const link of links.slice(0, 10)) {
        const url = safeUrl(link);
        if (!url) continue;
        const a = appendText(details, 'a', 'carrotsearch-result-link', url);
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        shownLinks++;
    }
    if (content) {
        const limit = 1200;
        appendText(details, 'div', 'carrotsearch-result-text', content.length > limit ? `${content.slice(0, limit)}…` : content);
    }
    if (!shownLinks && !content) appendText(details, 'div', 'carrotsearch-result-text', '没有可展示的内容');
    card.append(details);
    return card;
}

function reasoningText(message) {
    return String(message?.extra?.reasoning_display_text ?? message?.extra?.reasoning ?? '');
}

function makeTimeline(chat, group, context, pending) {
    const timeline = document.createElement('div');
    timeline.className = 'carrotsearch-timeline';
    // ST prevents clicks inside its reasoning details by default; allow source links and nested details.
    timeline.addEventListener('click', event => event.stopPropagation());
    let previousReasoning = '';
    for (let i = group.start; i <= group.end; i++) {
        const message = chat[i];
        if (isToolMessage(message)) {
            const calls = message.extra.tool_invocations;
            const callReasoning = String(calls[0]?.reasoning || '');
            if (callReasoning && callReasoning !== previousReasoning) {
                const node = appendText(timeline, 'div', 'carrotsearch-reasoning-part', '');
                node.innerHTML = context.messageFormatting(callReasoning, '', false, false, i, {}, true);
            }
            for (const call of calls) timeline.append(createToolCard(call));
            previousReasoning = '';
        } else {
            const text = reasoningText(message);
            if (text) {
                const node = appendText(timeline, 'div', 'carrotsearch-reasoning-part', '');
                node.innerHTML = context.messageFormatting(text, '', false, false, i, {}, true);
            }
            previousReasoning = String(message?.extra?.reasoning ?? '');
        }
    }
    if (pending) timeline.append(createToolCard(pending, true));
    return timeline;
}

export function initReasoningTimeline() {
    const context = SillyTavern.getContext();
    const chatElement = document.getElementById('chat');
    if (!chatElement || !context?.eventSource || !context?.messageFormatting) return;
    const eventTypes = context.eventTypes || context.event_types || {};
    let timer;
    let originalMode = false;
    let signature = '';

    function render() {
        timer = null;
        const chat = SillyTavern.getContext().chat;
        if (!Array.isArray(chat)) return;
        const groups = collectTimelineGroups(chat);
        // A tool can be executing before ST has saved its invocation.
        if (pendingTool && chat.length && isAssistant(chat.at(-1))) {
            const last = groups.at(-1);
            if (!last || last.end !== chat.length - 1) groups.push({ start: chat.length - 1, end: chat.length - 1, anchor: chat.length - 1 });
        }
        const state = JSON.stringify([groups, groups.map(g => chat.slice(g.start, g.end + 1)), pendingTool, originalMode]);
        const allHostsPresent = groups.every(group => chatElement.querySelector(`.mes[mesid="${group.anchor}"].carrotsearch-timeline-host .carrotsearch-timeline`));
        if (state === signature && allHostsPresent) return;
        signature = state;
        const open = new Set([...chatElement.querySelectorAll('.carrotsearch-timeline-host .mes_reasoning_details[open]')].map(el => el.closest('.mes')?.getAttribute('mesid')));
        const openResults = new Set([...chatElement.querySelectorAll('.carrotsearch-timeline-host .carrotsearch-result[open]')].map(el => `${el.closest('.mes')?.getAttribute('mesid')}:${[...el.closest('.carrotsearch-timeline').querySelectorAll('.carrotsearch-result')].indexOf(el)}`));
        chatElement.querySelectorAll('.carrotsearch-timeline, .carrotsearch-original-toggle, .carrotsearch-pending-host').forEach(el => el.remove());
        chatElement.querySelectorAll('.carrotsearch-timeline-host, .carrotsearch-timeline-source, .carrotsearch-original-mode, .carrotsearch-tool-host').forEach(el => el.classList.remove('carrotsearch-timeline-host', 'carrotsearch-timeline-source', 'carrotsearch-original-mode', 'carrotsearch-tool-host'));
        for (const group of groups) {
            const host = chatElement.querySelector(`.mes[mesid="${group.anchor}"]`);
            const details = host?.querySelector('.mes_reasoning_details');
            if (!host || !details) continue;
            // Never suppress source records which are not currently rendered.
            const elements = [];
            for (let i = group.start; i <= group.end; i++) {
                const el = chatElement.querySelector(`.mes[mesid="${i}"]`);
                if (!el) { elements.length = 0; break; }
                elements.push(el);
            }
            if (!elements.length) continue;
            host.classList.add('carrotsearch-timeline-host');
            if (isToolMessage(chat[group.anchor])) host.classList.add('carrotsearch-tool-host');
            if (originalMode) host.classList.add('carrotsearch-original-mode');
            else elements.filter(el => el !== host).forEach(el => el.classList.add('carrotsearch-timeline-source'));
            const showPending = pendingTool && group.end === chat.length - 1;
            details.append(makeTimeline(chat, group, context, showPending ? pendingTool : null));
            details.querySelectorAll('.carrotsearch-result').forEach((result, index) => { if (openResults.has(`${group.anchor}:${index}`)) result.open = true; });
            const header = details.querySelector('.mes_reasoning_header');
            if (header && !header.dataset.carrotsearchBound) {
                header.dataset.carrotsearchBound = 'true';
                header.addEventListener('click', event => {
                    const owner = header.closest('.carrotsearch-timeline-host');
                    if (!owner || owner.classList.contains('carrotsearch-original-mode') || !details.querySelector('.mes_reasoning:empty')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    details.open = !details.open;
                });
            }
            if (open.has(String(group.anchor))) details.open = true;
            const toggle = appendText(host.querySelector('.mes_block') || host, 'button', 'carrotsearch-original-toggle', originalMode ? '返回思考过程' : '查看原始记录 / 编辑思考');
            toggle.type = 'button';
            toggle.addEventListener('click', () => { originalMode = !originalMode; signature = ''; schedule(); });
        }
        if (pendingTool && (!groups.length || groups.at(-1).end !== chat.length - 1)) {
            // Some models call a tool without creating an assistant message first.
            const host = document.createElement('div');
            host.className = 'carrotsearch-pending-host';
            const details = document.createElement('details');
            details.className = 'mes_reasoning_details';
            details.open = true;
            appendText(details, 'summary', 'mes_reasoning_summary', '思考与工具');
            const timeline = document.createElement('div');
            timeline.className = 'carrotsearch-timeline';
            timeline.append(createToolCard(pendingTool, true));
            timeline.addEventListener('click', event => event.stopPropagation());
            details.append(timeline);
            details.addEventListener('click', event => event.stopPropagation());
            host.append(details);
            chatElement.append(host);
        }
    }
    function schedule() {
        if (!timer) timer = setTimeout(render, 120);
    }
    refreshTimeline = schedule;
    const events = ['TOOL_CALLS_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED', 'MESSAGE_REASONING_EDITED', 'MESSAGE_REASONING_DELETED', 'MORE_MESSAGES_LOADED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'STREAM_TOKEN_RECEIVED'];
    for (const name of events) if (eventTypes[name]) context.eventSource.on(eventTypes[name], schedule);
    if (eventTypes.CHAT_CHANGED) context.eventSource.on(eventTypes.CHAT_CHANGED, () => { pendingTool = null; originalMode = false; signature = ''; schedule(); });
    new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && node.classList?.contains('mes')))) {
            signature = '';
            schedule();
        }
    }).observe(chatElement, { childList: true });
    schedule();
}

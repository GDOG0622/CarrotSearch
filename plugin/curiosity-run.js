// The execution pipeline has injected I/O so decisions and persistence can be tested independently.
const { randomUUID } = require('crypto');
const { buildDecisionPrompt, buildSummaryPrompt, parseDecision, parseSummary } = require('./curiosity-core');

async function runCuriosityCheck({ user, config, scheme, loadCard, loadWorld, callAI, search, save, now = () => new Date(), random = Math.random, makeId = randomUUID }) {
    if (!scheme?.charName || !scheme?.worldBook) throw new Error('请先为角色选择搜索世界书');
    if (!config?.apiProfileId) throw new Error('请先选择 API 方案');
    const card = await loadCard(user, scheme.charName);
    const world = await loadWorld(user, scheme.worldBook);
    const recent = Object.values(world.entries || {})
        .filter(entry => !entry?.disable && entry?.carrotSearch?.type !== 'detail' && typeof entry?.content === 'string' && entry.content.trim())
        .sort((a, b) => String(b.carrotSearch?.timestamp || '').localeCompare(String(a.carrotSearch?.timestamp || '')))
        .slice(0, 15).map(entry => `${entry.comment || ''}\n${entry.content.slice(0, 1000)}`);
    const date = now();
    const timestamp = date.toLocaleString('sv-SE', { hour12: false });
    const decisionPrompt = buildDecisionPrompt({ card, customPrompt: config.customPrompt, recent, now: timestamp, ordinary: random() < 0.5 });
    const decision = parseDecision(await callAI(user, config.apiProfileId, config.apiModel, decisionPrompt, [], { jsonMode: true, signal: AbortSignal.timeout(120000) }));
    if (!decision.search) return { searched: false };
    const results = await search(config.searxngUrl, decision.query, config.searxngPreferences);
    if (!Array.isArray(results) || !results.length) throw new Error('搜索没有返回可保存的结果');
    const prompt = buildSummaryPrompt({ card, query: decision.query, results, timestamp });
    const summary = parseSummary(await callAI(user, config.apiProfileId, config.apiModel, prompt, [], { jsonMode: true, signal: AbortSignal.timeout(120000) }));
    const runId = makeId();
    await save(user, scheme.worldBook, { timestamp, query: decision.query, results, summary, runId });
    return { searched: true, query: decision.query, runId };
}

module.exports = { runCuriosityCheck };

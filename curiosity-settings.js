// Recover only settings from the briefly published wrong-repository version.
// Never start the migrated timers automatically; the user can review and enable them.
export function migrateCuriositySettings(websearch, legacy) {
    if (!websearch || Object.hasOwn(websearch, 'curiosity') || !legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return false;
    const saved = { enabled: false, stUser: '', apiProfileId: '', apiModel: '', customPrompt: null, searxngUrl: '', searxngPreferences: '', schemes: [], migratedFromCarrot: true };
    for (const key of ['stUser', 'apiProfileId', 'apiModel', 'customPrompt', 'searxngUrl', 'searxngPreferences']) {
        if (typeof legacy[key] === 'string' || (key === 'customPrompt' && legacy[key] === null)) saved[key] = legacy[key];
    }
    if (Array.isArray(legacy.schemes)) saved.schemes = structuredClone(legacy.schemes);
    websearch.curiosity = saved;
    return true;
}

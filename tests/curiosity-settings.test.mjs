import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateCuriositySettings } from '../curiosity-settings.js';

test('recovers prior mistaken settings without automatically enabling searches', () => {
    const source = { enabled: true, stUser: 'u', apiProfileId: 'profile', searxngUrl: 'http://127.0.0.1:8889', customPrompt: '自定义', schemes: [{ id: 'a' }] };
    const websearch = {};
    assert.equal(migrateCuriositySettings(websearch, source), true);
    assert.equal(websearch.curiosity.enabled, false);
    assert.equal(websearch.curiosity.apiProfileId, 'profile');
    assert.equal(websearch.curiosity.customPrompt, '自定义');
    assert.deepEqual(websearch.curiosity.schemes, source.schemes);
    assert.notEqual(websearch.curiosity.schemes, source.schemes);
    assert.equal(source.enabled, true);
});

test('never overwrites existing CarrotSearch settings', () => {
    const websearch = { curiosity: { enabled: true, schemes: [] } };
    assert.equal(migrateCuriositySettings(websearch, { enabled: false }), false);
    assert.equal(websearch.curiosity.enabled, true);
});

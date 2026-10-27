const express = require('express');
const curiosity = require('./curiosity');
const manifest = require('./manifest.json');

const info = { id: manifest.id, name: manifest.name, description: manifest.description };

async function init(router) {
    router.use(express.json({ limit: '1mb' }));
    router.get('/ping', (_req, res) => res.json({ ok: true, version: manifest.version }));
    router.get('/curiosity/defaults', curiosity.defaultsHandler);
    router.get('/curiosity/users', curiosity.usersHandler);
    router.get('/curiosity/chars', curiosity.charsHandler);
    router.get('/curiosity/profiles', curiosity.profilesHandler);
    router.get('/curiosity/models', curiosity.modelsHandler);
    router.get('/curiosity/worlds', curiosity.worldsHandler);
    router.get('/curiosity/status', curiosity.statusHandler);
    router.post('/curiosity/revisions', curiosity.revisionsHandler);
    router.post('/curiosity/editor', curiosity.editorHandler);
    router.post('/curiosity/run-now', curiosity.runNowHandler);
    router.post('/curiosity/start', curiosity.startHandler);
    router.post('/curiosity/stop', curiosity.stopHandler);
    curiosity.resume();
    console.log(`[carrotsearch-plugin] v${manifest.version} 已加载`);
}

async function exit() {}
module.exports = { init, exit, info };

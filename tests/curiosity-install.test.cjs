const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install } = require('../plugin/install.cjs');

test('installs independently and backs up an existing CarrotSearch plugin without touching ST or Carrot', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carrotsearch-install-'));
    try {
        fs.writeFileSync(path.join(root, 'server.js'), 'ST');
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'config.yaml'), 'enableServerPlugins: true\n');
        const other = path.join(root, 'plugins', 'carrot'); fs.mkdirSync(other, { recursive: true }); fs.writeFileSync(path.join(other, 'marker'), 'untouched');
        const destination = path.join(root, 'plugins', 'carrotsearch'); fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, 'index.js'), 'old version');
        const result = install(root, { skipDependencies: true });
        assert.equal(fs.readFileSync(path.join(result.backup, 'index.js'), 'utf8'), 'old version');
        assert.equal(fs.readFileSync(path.join(other, 'marker'), 'utf8'), 'untouched');
        assert.equal(fs.readFileSync(path.join(root, 'config.yaml'), 'utf8'), 'enableServerPlugins: true\n');
        assert.ok(fs.existsSync(path.join(destination, 'curiosity.js')));
        assert.ok(fs.existsSync(path.join(destination, 'package-lock.json')));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

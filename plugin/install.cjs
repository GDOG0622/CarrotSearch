#!/usr/bin/env node
// Install only the CarrotSearch server plugin; never alter the ST config or other plugins.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function install(root, { skipDependencies = false } = {}) {
    if (!root) throw new Error('请提供 SillyTavern 根目录，例如 node plugin/install.cjs /root/SillyTavern');
    const stRoot = path.resolve(root);
    if (!fs.existsSync(path.join(stRoot, 'server.js')) || !fs.existsSync(path.join(stRoot, 'src'))) throw new Error('该路径不是有效的 SillyTavern 根目录');
    const source = __dirname;
    const destination = path.join(stRoot, 'plugins', 'carrotsearch');
    if (path.resolve(source) === path.resolve(destination)) throw new Error('请从 CarrotSearch 扩展目录执行安装，不要从目标目录运行');
    let backup = null;
    if (fs.existsSync(destination)) {
        backup = path.join(stRoot, 'backups', 'carrotsearch', `before-update-${Date.now()}`);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.cpSync(destination, backup, { recursive: true, errorOnExist: true, force: false, filter: src => path.basename(src) !== 'node_modules' });
    }
    fs.mkdirSync(destination, { recursive: true });
    for (const name of ['index.js', 'manifest.json', 'package.json', 'package-lock.json', 'support.js', 'curiosity.js', 'curiosity-core.js', 'curiosity-run.js', 'curiosity-search.js', 'curiosity-worlds.js']) {
        fs.copyFileSync(path.join(source, name), path.join(destination, name));
    }
    if (!skipDependencies) {
        const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: destination, stdio: 'inherit', shell: process.platform === 'win32' });
        if (result.error || result.status !== 0) throw new Error(`依赖安装失败；原插件备份：${backup || '首次安装无备份'}`);
    }
    return { destination, backup };
}

if (require.main === module) {
    try {
        const result = install(process.argv[2]);
        console.log(`CarrotSearch 后端已安装到 ${result.destination}`);
        if (result.backup) console.log(`旧版备份：${result.backup}`);
        console.log('请确保酒馆配置中启用了服务端插件，然后重启酒馆进程。');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { install };

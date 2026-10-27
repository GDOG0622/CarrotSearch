const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeEntries } = require('./curiosity-core');

function validName(name) {
    return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
        && !name.includes('/') && !name.includes('\\') && !name.includes('\0');
}

function createWorldStore(dataRoot) {
    function worldPath(user, book) {
        if (!validName(user) || !validName(book)) throw new Error('用户或世界书名称无效');
        const directory = path.resolve(dataRoot, user, 'worlds');
        const file = path.join(directory, `${book}.json`);
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('世界书文件无效');
        return file;
    }
    function list(user) {
        if (!validName(user)) throw new Error('用户名称无效');
        return fs.readdirSync(path.join(dataRoot, user, 'worlds'), { withFileTypes: true })
            .filter(item => item.isFile() && item.name.endsWith('.json'))
            .map(item => item.name.slice(0, -5)).sort((a, b) => a.localeCompare(b));
    }
    function read(user, book) {
        const data = JSON.parse(fs.readFileSync(worldPath(user, book), 'utf8'));
        if (!data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw new Error('世界书格式无效');
        return data;
    }
    function revision(user, book) {
        return crypto.createHash('sha256').update(fs.readFileSync(worldPath(user, book))).digest('hex');
    }
    function append(user, book, record) {
        const file = worldPath(user, book);
        const raw = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(raw);
        if (!data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw new Error('世界书格式无效');
        if (Object.values(data.entries).some(entry => entry?.carrotSearch?.runId === record.runId)) return;
        const used = Object.keys(data.entries).map(Number).filter(Number.isSafeInteger);
        const firstUid = used.length ? Math.max(...used) + 1 : 0;
        const entries = makeEntries({ ...record, firstUid });
        for (const entry of entries) data.entries[entry.uid] = entry;
        const temporary = `${file}.carrot-${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(data, null, 4), { flag: 'wx', mode: fs.statSync(file).mode & 0o777 });
            if (fs.readFileSync(file, 'utf8') !== raw) throw new Error('世界书在写入期间发生改变，未覆盖原文件');
            fs.renameSync(temporary, file);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }
    return { list, read, append, revision };
}

module.exports = { createWorldStore };

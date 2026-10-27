const { test } = require('node:test');
const assert = require('node:assert/strict');
global.CardCore = require('../core');
const { DriveCards } = require('../drive');
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers }); }
test('Drive paginates all files, reads only app data, and includes auth header', async () => {
    const calls = [];
    const drive = new DriveCards({ token: () => 'test-token', fetcher: async (url, init) => {
        calls.push([url, init]);
        if (url.includes('files?')) return url.includes('pageToken=next') ? json({ files: [{ id: 'two' }] }) : json({ files: [{ id: 'one' }], nextPageToken: 'next' });
        if (url.includes('?fields=etag')) return json({ etag: 'version-1' });
        return json({ data: { mainName: 'Pikachu' } }, 200, { etag: 'version-1' });
    } });
    const records = await drive.list();
    assert.equal(records.length, 2);
    assert.ok(calls[0][0].includes('spaces=appDataFolder'));
    assert.ok(calls.every(([, init]) => init.headers.Authorization === 'Bearer test-token'));
    assert.equal(records[0].revision, 'version-1');
});
test('401 expires memory session and never retries a mutation', async () => {
    let expired = 0; let calls = 0;
    const drive = new DriveCards({ token: () => 'expired', onExpired: () => expired++, fetcher: async () => { calls++; return json({}, 401); } });
    await assert.rejects(drive.save({ id: 'card', data: CardCore.defaults() }, 'v1'), /expiró/);
    assert.equal(expired, 1); assert.equal(calls, 1);
});
test('Drive updates include optimistic concurrency and do not overwrite a conflict', async () => {
    let request;
    const drive = new DriveCards({ token: () => 'test', fetcher: async (url, init) => { request = { url, init }; return json({}, 412); } });
    await assert.rejects(drive.save({ id: 'id', data: CardCore.defaults() }, 'etag-1'), /otro dispositivo/);
    assert.equal(request.init.headers['If-Match'], 'etag-1');
    assert.equal(request.init.method, 'PUT');
    assert.ok(request.url.includes('/upload/drive/v2/'));
});

test('Drive obtains revision from metadata JSON when media has no ETag and rejects changing reads', async () => {
    let revision = 'one'; let reads = 0;
    const drive = new DriveCards({ token: () => 'test', fetcher: async url => {
        if (url.includes('?fields=etag')) return json({ etag: ++reads % 2 ? 'one' : revision });
        return json({ data: CardCore.defaults() });
    } });
    assert.equal((await drive.get('card')).revision, 'one');
    revision = 'two';
    await assert.rejects(drive.get('card'), /cambió durante la lectura/);
});
test('Drive refuses oversize documents before sending and reports partial list errors', async () => {
    const drive = new DriveCards({ token: () => 'test', fetcher: async url => url.includes('files?') ? json({ files: [{ id: 'broken' }] }) : json({}, 500) });
    await assert.rejects(drive.save({ data: { mainName: 'A', customArtData: 'x'.repeat(6 * 1024 * 1024) } }), /supera 5 MB/);
    await assert.rejects(drive.list(), /No se pudieron leer 1/);
});

test('Drive reports loading progress and reuses only unchanged cards during the session', async () => {
    let modifiedTime = 'first'; let mediaReads = 0;
    const drive = new DriveCards({ token: () => 'test', fetcher: async url => {
        if (url.includes('files?')) return json({ files: [{ id: 'one', modifiedTime }] });
        if (url.includes('?fields=etag')) return json({ etag: modifiedTime });
        mediaReads++; return json({ data: { mainName: 'Pikachu' } });
    } });
    const progress = [];
    await drive.list({ onProgress: value => progress.push(value) });
    assert.deepEqual(progress, [{ completed: 0, total: 1 }, { completed: 1, total: 1 }]);
    await drive.list();
    assert.equal(mediaReads, 1);
    modifiedTime = 'second';
    await drive.list();
    assert.equal(mediaReads, 2);
});

test('Drive delivers each card before the full collection completes, including cached cards', async () => {
    let release;
    const blocked = new Promise(resolve => release = resolve);
    const delivered = [];
    const drive = new DriveCards({ token: () => 'test', fetcher: async url => {
        if (url.includes('files?')) return json({ files: [{ id: 'one', modifiedTime: 'v1' }, { id: 'two', modifiedTime: 'v1' }] });
        if (url.includes('/two?alt=media')) await blocked;
        if (url.includes('?fields=etag')) return json({ etag: 'v1' });
        return json({ data: CardCore.defaults() });
    } });
    const pending = drive.list({ onRecord: record => delivered.push(record.id) });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(delivered, ['one']);
    release(); await pending;
    assert.deepEqual(delivered.sort(), ['one', 'two']);
    delivered.length = 0;
    await drive.list({ onRecord: record => delivered.push(record.id) });
    assert.deepEqual(delivered.sort(), ['one', 'two']);
});

test('summary gallery downloads previews only and reuses persistent cache across sessions by account and modification time', async () => {
    const rows = new Map(); let previewReads = 0; let originals = 0; let modifiedTime = 'time-1'; let account = 'account-A';
    const previewStore = { get: async (account, id, version) => rows.get(`${account}:${id}:${version}`), put: async (account, id, version, value) => rows.set(`${account}:${id}:${version}`, value) };
    const fetcher = async url => {
        if (url.includes('about?')) return json({ user: { permissionId: account } });
        if (url.includes('files?')) {
            if (decodeURIComponent(url).includes('pokecard-preview-v1')) return json({ files: [{ id: 'preview', appProperties: { cardId: 'card', sourceModifiedTime: modifiedTime } }] });
            return json({ files: [{ id: 'card', modifiedTime }] });
        }
        if (url.includes('/preview?alt=media')) { previewReads++; return json({ schemaVersion: 1, cardId: 'card', sourceModifiedTime: modifiedTime, revision: 'etag', thumbnail: 'data:image/webp;base64,dGVzdA==', data: { mainName: 'Pikachu', config: { setTextVal: 'KANrev', setNumCurr: '1' } } }); }
        originals++; throw new Error('Gallery requested an original');
    };
    const first = new DriveCards({ token: () => 'one', fetcher, previewStore }); await first.profile();
    const records = await first.list({ summaries: true });
    assert.equal(records[0].summary, true); assert.equal(records[0].data.mainName, 'Pikachu');
    const reloaded = new DriveCards({ token: () => 'two', fetcher, previewStore }); await reloaded.profile();
    await reloaded.list({ summaries: true }); assert.equal(previewReads, 1); assert.equal(originals, 0);
    modifiedTime = 'time-2'; await reloaded.list({ summaries: true }); assert.equal(previewReads, 2);
    assert.ok([...rows.keys()].every(key => key.startsWith('account-A:')));
    account = 'account-B';
    const other = new DriveCards({ token: () => 'other', fetcher, previewStore }); await other.profile();
    await other.list({ summaries: true }); assert.equal(previewReads, 3); assert.equal(originals, 0);
    assert.ok([...rows.keys()].some(key => key.startsWith('account-B:')));
});

test('legacy cards prepare separate previews once without rewriting original files', async () => {
    let preview; let originalReads = 0; const writes = [];
    const thumbnail = 'data:image/webp;base64,dGVzdA==';
    const fetcher = async (url, init) => {
        if (init.method === 'POST' || init.method === 'PATCH' || init.method === 'PUT') {
            writes.push({ url, method: init.method });
            const part = init.body.split('Content-Type: application/json\r\n\r\n')[1];
            preview = JSON.parse(part.slice(0, part.lastIndexOf('\r\n--')));
            return json({ id: 'preview' });
        }
        if (url.includes('files?')) {
            if (decodeURIComponent(url).includes('pokecard-preview-v1')) return json({ files: preview ? [{ id: 'preview', appProperties: { cardId: 'card', sourceModifiedTime: 'time-1' } }] : [] });
            return json({ files: [{ id: 'card', modifiedTime: 'time-1' }] });
        }
        if (url.includes('/preview?alt=media')) return json(preview);
        if (url.includes('?fields=etag')) return json({ etag: 'v1' });
        originalReads++; return json({ data: { mainName: 'Pikachu', customArtData: thumbnail, abilityName: 'Original intacto' } });
    };
    const options = { token: () => 'test', fetcher, createThumbnail: async () => thumbnail };
    const first = new DriveCards(options);
    const progress = [];
    await first.list({ summaries: true, onProgress: value => progress.push(value) });
    assert.equal(originalReads, 1); assert.ok(progress.some(value => value.preparing));
    assert.equal(writes.length, 1); assert.equal(writes[0].method, 'POST');
    assert.ok(!writes[0].url.includes('/files/card'));
    assert.equal(preview.data.customArtData, undefined); assert.equal(preview.data.abilityName, undefined);
    await new DriveCards(options).list({ summaries: true });
    assert.equal(originalReads, 1); assert.equal(writes.length, 1);
});

test('Drive refuses to overwrite an original with a lightweight summary', async () => {
    let requests = 0;
    const drive = new DriveCards({ token: () => 'test', fetcher: async () => { requests++; throw new Error('Must not send'); } });
    await assert.rejects(drive.save({ summary: true, data: { mainName: 'Miniatura' } }, 'etag'), /carta completa/);
    assert.equal(requests, 0);
});

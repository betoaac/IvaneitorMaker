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

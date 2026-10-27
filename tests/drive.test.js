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
    assert.equal(request.init.method, 'PATCH');
});
test('Drive refuses oversize documents before sending and reports partial list errors', async () => {
    const drive = new DriveCards({ token: () => 'test', fetcher: async url => url.includes('files?') ? json({ files: [{ id: 'broken' }] }) : json({}, 500) });
    await assert.rejects(drive.save({ data: { mainName: 'A', customArtData: 'x'.repeat(6 * 1024 * 1024) } }), /supera 5 MB/);
    await assert.rejects(drive.list(), /No se pudieron leer 1/);
});

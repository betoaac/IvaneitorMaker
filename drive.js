(function (root) {
    'use strict';
    const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    class DriveCards {
        constructor({ token, fetcher = (...args) => root.fetch(...args), onExpired = () => {} }) {
            this.token = token; this.fetcher = fetcher; this.onExpired = onExpired;
        }
        async request(path, init = {}, upload = false) {
            const response = await this.fetcher(`https://www.googleapis.com/${upload ? 'upload/' : ''}drive/v3/${path}`, {
                ...init, signal: AbortSignal.timeout(30000),
                headers: { ...init.headers, Authorization: `Bearer ${this.token()}` }
            });
            if (response.status === 401) { this.onExpired(); throw new Error('La sesión de Google expiró. Vuelve a conectar y repite la operación.'); }
            if (response.status === 412) throw new Error('Esta carta cambió en otro dispositivo. Recarga la galería antes de guardar.');
            if (!response.ok) throw new Error(response.status === 403 ? 'Google no permitió la operación. Revisa permisos o espacio en Drive.' : `Drive no confirmó la operación (HTTP ${response.status}). Tus datos siguen en el editor.`);
            return response;
        }
        async profile() { return (await (await this.request('about?fields=user(displayName,emailAddress,permissionId)')).json()).user; }
        async list() {
            const files = [];
            let pageToken = '';
            do {
                const query = new URLSearchParams({ spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='app' and value='pokecard-v1' }", fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: '100' });
                if (pageToken) query.set('pageToken', pageToken);
                const page = await (await this.request('files?' + query)).json();
                files.push(...(page.files || [])); pageToken = page.nextPageToken;
            } while (pageToken);
            // Bounded parallelism avoids flooding Drive for a large collection.
            const records = [];
            const failures = [];
            let index = 0;
            await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
                while (index < files.length) {
                    const file = files[index++];
                    try { records.push(await this.get(file.id)); }
                    catch (error) { failures.push({ file, error }); }
                }
            }));
            if (failures.length) throw new Error(`No se pudieron leer ${failures.length} cartas de Drive. ${failures[0].error.message}`);
            return records;
        }
        async get(id) {
            const response = await this.request(`files/${encodeURIComponent(id)}?alt=media`);
            const text = await response.text();
            if (text.length > 24 * 1024 * 1024) throw new Error('Carta demasiado grande.');
            const record = JSON.parse(text);
            record.data = CardCore.normalizeCard(record.data);
            record.id = id;
            record.revision = response.headers.get('etag');
            record.remote = true;
            return record;
        }
        async save(record, revision) {
            if (record.remote && !revision) throw new Error('Drive no entregó una revisión para esta carta. Exporta un JSON o guárdala como nueva; no se sobrescribió el archivo.');
            const body = JSON.stringify({ schemaVersion: 1, ...record, revision: undefined });
            if (new Blob([body]).size > 5 * 1024 * 1024) throw new Error('La carta supera 5 MB. Reduce sus imágenes antes de guardarla en Drive.');
            let response;
            if (revision) {
                response = await this.request(`files/${encodeURIComponent(record.id)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body }, true);
            } else {
                const boundary = 'pokecard_' + crypto.randomUUID().replaceAll('-', '');
                const metadata = { name: `${CardCore.safeName(record.data.mainName)}.json`, mimeType: 'application/json', parents: ['appDataFolder'], appProperties: { app: 'pokecard-v1' } };
                const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
                response = await this.request('files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }, true);
            }
            const saved = await response.json();
            return this.get(saved.id || record.id);
        }
        async remove(id, revision) {
            await this.request(`files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: revision ? { 'If-Match': revision } : {} });
        }
    }
    root.DriveCards = DriveCards;
    root.DRIVE_SCOPE = SCOPE;
    if (typeof module !== 'undefined' && module.exports) module.exports = { DriveCards, SCOPE };
})(globalThis);

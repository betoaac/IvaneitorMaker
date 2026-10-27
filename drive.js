(function (root) {
    'use strict';
    const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    class DriveCards {
        constructor({ token, fetcher = (...args) => root.fetch(...args), onExpired = () => {}, previewStore = root.DrivePreviewCache, createThumbnail = async record => record.thumbnail || '' }) {
            this.token = token; this.fetcher = fetcher; this.onExpired = onExpired;
            this.cache = new Map();
            this.summaryCache = new Map(); this.previewStore = previewStore; this.createThumbnail = createThumbnail;
        }
        async request(path, init = {}, upload = false, version = 3) {
            const response = await this.fetcher(`https://www.googleapis.com/${upload ? 'upload/' : ''}drive/v${version}/${path}`, {
                ...init, cache: 'no-store', signal: AbortSignal.timeout(30000),
                headers: { ...init.headers, Authorization: `Bearer ${this.token()}` }
            });
            if (response.status === 401) { this.onExpired(); throw new Error('La sesión de Google expiró. Vuelve a conectar y repite la operación.'); }
            if (response.status === 412) throw new Error('Esta carta cambió en otro dispositivo. Recarga la galería antes de guardar.');
            if (!response.ok) throw new Error(response.status === 403 ? 'Google no permitió la operación. Revisa permisos o espacio en Drive.' : `Drive no confirmó la operación (HTTP ${response.status}). Tus datos siguen en el editor.`);
            return response;
        }
        async profile() {
            const user = (await (await this.request('about?fields=user(displayName,emailAddress,permissionId)')).json()).user;
            this.accountId = user.permissionId; return user;
        }
        async previewFiles(cardId) {
            const files = []; let pageToken = '';
            do {
                const query = new URLSearchParams({ spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='app' and value='pokecard-preview-v1' }" + (cardId ? ` and appProperties has { key='cardId' and value='${cardId.replace(/[^\w-]/g, '')}' }` : ''), fields: 'nextPageToken,files(id,modifiedTime,appProperties)', pageSize: '1000' });
                if (pageToken) query.set('pageToken', pageToken);
                const page = await (await this.request('files?' + query)).json();
                files.push(...(page.files || [])); pageToken = page.nextPageToken;
            } while (pageToken);
            return files;
        }
        makeSummary(record, sourceModifiedTime, thumbnail) {
            const config = record.data.config || {};
            return { schemaVersion: 1, cardId: record.id, sourceModifiedTime, revision: record.revision, timestamp: record.timestamp,
                thumbnail: CardCore.safeImage(thumbnail), data: { mainName: record.data.mainName, config: { setTextVal: config.setTextVal, setNumCurr: config.setNumCurr, rarityIcon: config.rarityIcon } } };
        }
        validSummary(value, file) {
            return value?.schemaVersion === 1 && value.cardId === file.id && typeof file.modifiedTime === 'string' && value.sourceModifiedTime === file.modifiedTime && typeof value.revision === 'string' && !!value.revision && typeof value.data?.mainName === 'string' && typeof value.thumbnail === 'string' && value.thumbnail.length < 200000 && /^data:image\/(webp|png);base64,/.test(value.thumbnail);
        }
        async writePreview(summary, existing) {
            const metadata = { name: `preview-${summary.cardId}.json`, mimeType: 'application/json', appProperties: { app: 'pokecard-preview-v1', cardId: summary.cardId, sourceModifiedTime: summary.sourceModifiedTime } };
            if (!existing) metadata.parents = ['appDataFolder'];
            const boundary = 'preview_' + crypto.randomUUID().replaceAll('-', '');
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(summary)}\r\n--${boundary}--`;
            await this.request(existing ? `files/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=id` : 'files?uploadType=multipart&fields=id', { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, true);
        }
        async summaryFor(file, preview, onPreparing) {
            let value = this.summaryCache.get(file.id);
            let fromCache = this.validSummary(value, file);
            if (!this.validSummary(value, file) && this.accountId) {
                try { value = await this.previewStore?.get(this.accountId, file.id, file.modifiedTime); } catch { /* Cache is optional. */ }
                fromCache = this.validSummary(value, file);
            }
            if (!this.validSummary(value, file) && preview?.appProperties?.sourceModifiedTime === file.modifiedTime) {
                const response = await this.request(`files/${encodeURIComponent(preview.id)}?alt=media`);
                const text = await response.text();
                if (text.length < 200000) { try { value = JSON.parse(text); } catch { /* Rebuild invalid previews. */ } }
            }
            if (!this.validSummary(value, file)) {
                onPreparing();
                const full = await this.get(file.id);
                value = this.makeSummary(full, file.modifiedTime, await this.createThumbnail(full));
                if (!this.validSummary(value, file)) throw new Error('No se pudo preparar la miniatura de esta carta.');
                try { await this.writePreview(value, preview); } catch { value.previewPending = true; }
            }
            // Keep only the preview allowlist, even if a remote file contains extra fields.
            value = this.makeSummary({ ...value, id: file.id }, file.modifiedTime, value.thumbnail);
            this.summaryCache.set(file.id, value);
            if (this.accountId && !fromCache) { try { await this.previewStore?.put(this.accountId, file.id, file.modifiedTime, value); } catch { /* Quota or private browsing must not block the gallery. */ } }
            return { ...value, id: file.id, remote: true, summary: true };
        }
        async list({ onProgress = () => {}, onRecord = () => {}, summaries = false } = {}) {
            const files = [];
            let pageToken = '';
            do {
                const query = new URLSearchParams({ spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='app' and value='pokecard-v1' }", fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: '100' });
                if (pageToken) query.set('pageToken', pageToken);
                const page = await (await this.request('files?' + query)).json();
                files.push(...(page.files || [])); pageToken = page.nextPageToken;
            } while (pageToken);
            const previews = summaries && files.length ? await this.previewFiles() : [];
            const previewByCard = new Map();
            for (const preview of previews) {
                const id = preview.appProperties?.cardId;
                const previous = previewByCard.get(id);
                if (!previous || (preview.modifiedTime || '') > (previous.modifiedTime || '')) previewByCard.set(id, preview);
            }
            // Bounded parallelism avoids flooding Drive for a large collection.
            const records = [];
            const failures = [];
            let index = 0; let completed = 0;
            onProgress({ completed, total: files.length });
            const present = new Set(files.map(file => file.id));
            for (const id of this.cache.keys()) if (!present.has(id)) this.cache.delete(id);
            for (const id of this.summaryCache.keys()) if (!present.has(id)) this.summaryCache.delete(id);
            await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
                while (index < files.length) {
                    const file = files[index++];
                    try {
                        const cached = this.cache.get(file.id);
                        const record = summaries ? await this.summaryFor(file, previewByCard.get(file.id), () => onProgress({ completed, total: files.length, preparing: true }))
                            : cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime ? cached.record : await this.get(file.id);
                        records.push(record);
                        if (!summaries) this.cache.set(file.id, { modifiedTime: file.modifiedTime, record });
                        onRecord(record);
                    }
                    catch (error) { failures.push({ file, error }); }
                    finally { onProgress({ completed: ++completed, total: files.length }); }
                }
            }));
            if (failures.length) throw new Error(`No se pudieron leer ${failures.length} cartas de Drive. ${failures[0].error.message}`);
            return records;
        }
        async get(id) {
            // v3 media downloads do not expose a usable file ETag. v2 supplies it in JSON.
            const metadataPath = `files/${encodeURIComponent(id)}?fields=etag`;
            const before = await (await this.request(metadataPath, {}, false, 2)).json();
            const response = await this.request(`files/${encodeURIComponent(id)}?alt=media`);
            const text = await response.text();
            if (text.length > 24 * 1024 * 1024) throw new Error('Carta demasiado grande.');
            const after = await (await this.request(metadataPath, {}, false, 2)).json();
            if (!before.etag || before.etag !== after.etag) throw new Error('La revisión de esta carta cambió durante la lectura. Recarga la galería antes de guardar.');
            const record = JSON.parse(text);
            record.data = CardCore.normalizeCard(record.data);
            record.id = id;
            record.revision = after.etag;
            record.remote = true;
            return record;
        }
        async save(record, revision) {
            if (record.summary) throw new Error('Abre la carta completa antes de guardarla.');
            this.cache.delete(record.id);
            this.summaryCache.delete(record.id);
            if (record.remote && !revision) throw new Error('Drive no entregó una revisión para esta carta. Exporta un JSON o guárdala como nueva; no se sobrescribió el archivo.');
            const body = JSON.stringify({ schemaVersion: 1, ...record, revision: undefined });
            if (new Blob([body]).size > 5 * 1024 * 1024) throw new Error('La carta supera 5 MB. Reduce sus imágenes antes de guardarla en Drive.');
            let response;
            if (revision) {
                response = await this.request(`files/${encodeURIComponent(record.id)}?uploadType=media`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body }, true, 2);
            } else {
                const boundary = 'pokecard_' + crypto.randomUUID().replaceAll('-', '');
                const metadata = { name: `${CardCore.safeName(record.data.mainName)}.json`, mimeType: 'application/json', parents: ['appDataFolder'], appProperties: { app: 'pokecard-v1' } };
                const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
                response = await this.request('files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }, true);
            }
            const saved = await response.json();
            const full = await this.get(saved.id || record.id);
            try {
                const file = await (await this.request(`files/${encodeURIComponent(full.id)}?fields=id,modifiedTime`)).json();
                const current = await (await this.request(`files/${encodeURIComponent(full.id)}?fields=etag`, {}, false, 2)).json();
                if (current.etag !== full.revision) throw new Error('La carta cambió antes de preparar su miniatura.');
                const summary = this.makeSummary(full, file.modifiedTime, await this.createThumbnail(full));
                if (!this.validSummary(summary, { id: full.id, modifiedTime: file.modifiedTime })) throw new Error('Miniatura no disponible');
                await this.writePreview(summary, (await this.previewFiles(full.id))[0]);
                this.summaryCache.set(full.id, summary);
                if (this.accountId) await this.previewStore?.put(this.accountId, full.id, file.modifiedTime, summary);
            } catch { full.previewPending = true; }
            return full;
        }
        async remove(id, revision) {
            this.cache.delete(id);
            this.summaryCache.delete(id);
            await this.request(`files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: revision ? { 'If-Match': revision } : {} }, false, 2);
        }
    }
    root.DriveCards = DriveCards;
    root.DRIVE_SCOPE = SCOPE;
    if (typeof module !== 'undefined' && module.exports) module.exports = { DriveCards, SCOPE };
})(globalThis);

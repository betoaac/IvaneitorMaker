(function (root) {
    'use strict';
    let database;
    function open() {
        if (!database) database = new Promise((resolve, reject) => {
            const request = indexedDB.open('pokecard-web-v1', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Cierra otras pestañas para actualizar el almacenamiento.'));
        });
        return database;
    }
    async function transaction(mode, action) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('records', mode);
            const request = action(tx.objectStore('records'));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar en este navegador. Exporta un JSON.'));
        });
    }
    root.LocalCards = {
        async list() { return (await transaction('readonly', store => store.getAll())).filter(x => x.id !== 'draft'); },
        get(id) { return transaction('readonly', store => store.get(id)); },
        async save(record, revision) {
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('records', 'readwrite');
                const store = tx.objectStore('records');
                const request = store.get(record.id);
                request.onsuccess = () => {
                    if ((request.result && request.result.revision !== revision) || (!request.result && revision !== undefined && revision !== null)) { tx.abort(); return; }
                    store.put({ ...record, revision: (revision || 0) + 1 });
                };
                tx.oncomplete = () => resolve({ ...record, revision: (revision || 0) + 1 });
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('Esta carta cambió en otra pestaña. Recarga la galería antes de guardar.'));
            });
        },
        async remove(id, revision) {
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('records', 'readwrite');
                const store = tx.objectStore('records');
                const request = store.get(id);
                request.onsuccess = () => {
                    if (request.result && request.result.revision !== revision) { tx.abort(); return; }
                    store.delete(id);
                };
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('Esta carta cambió en otra pestaña. Recarga antes de borrarla.'));
            });
        },
        saveDraft(data) { return transaction('readwrite', store => store.put({ id: 'draft', data })); },
        getDraft() { return transaction('readonly', store => store.get('draft')); }
    };
    // Separate from editable cards/drafts; contains only account-scoped lightweight previews.
    let previewDatabase;
    async function previewTransaction(mode, action) {
        if (!previewDatabase) previewDatabase = new Promise((resolve, reject) => {
            const request = indexedDB.open('ivaneitormaker-drive-previews-v1', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('previews', { keyPath: 'key' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Caché de miniaturas bloqueada.'));
        });
        const db = await previewDatabase;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('previews', mode);
            const request = action(tx.objectStore('previews'));
            tx.oncomplete = () => resolve(request?.result);
            tx.onabort = tx.onerror = () => reject(tx.error);
        });
    }
    root.DrivePreviewCache = {
        async get(account, id, version) {
            const entry = await previewTransaction('readonly', store => store.get(JSON.stringify([account, id])));
            return entry?.version === version ? entry.value : undefined;
        },
        async put(account, id, version, value) {
            await previewTransaction('readwrite', store => store.put({ key: JSON.stringify([account, id]), account, version, value }));
        },
        async clear(account) {
            await previewTransaction('readwrite', store => {
                const request = store.openCursor();
                request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value.account === account) cursor.delete(); cursor.continue(); };
            });
        }
    };
})(globalThis);

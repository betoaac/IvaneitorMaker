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
})(globalThis);

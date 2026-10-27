let batchRunning = false;
let batchCancelled = false;
const batchUrls = [];
function cancelBatch() { batchCancelled = true; }
async function downloadSetUltra(setName, records) {
    if (batchRunning) { status('Ya hay una exportación en curso.', true); return; }
    if (!records.length) { status('No hay cartas para exportar.', true); return; }
    batchRunning = true; batchCancelled = false;
    // Freeze inputs once. Editing the form and API callbacks cannot change the batch.
    const inputs = records.map(record => structuredClone(record.data));
    const panel = document.getElementById('batch-panel'); panel.hidden = false;
    const output = document.getElementById('batch-downloads'); output.replaceChildren();
    batchUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
    const progress = document.getElementById('batch-progress'); progress.max = inputs.length; progress.value = 0;
    const label = document.getElementById('batch-status');
    document.getElementById('batch-cancel').hidden = false;
    const multiplier = Number(document.getElementById('exportResolution').value) || 2;
    let entries = {}; let bytes = 0; let part = 0; let succeeded = 0;
    const errors = [];
    function flush() {
        if (!Object.keys(entries).length) return;
        const zip = fflate.zipSync(entries, { level: 0 });
        const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); batchUrls.push(url);
        const link = element('a', `Descargar parte ${++part}`); link.href = url;
        link.download = `${CardCore.safeName(setName)}_${String(part).padStart(3, '0')}.zip`;
        output.append(link); entries = {}; bytes = 0;
    }
    try {
        for (let index = 0; index < inputs.length; index++) {
            if (batchCancelled) break;
            const canvas = document.createElement('canvas');
            try {
                const data = CardCore.normalizeCard(inputs[index], defaultConfig);
                label.textContent = `Generando ${index + 1}/${inputs.length}: ${data.mainName || 'Carta'}`;
                await renderCardSnapshot(data, canvas, { multiplier, fullResolution: true });
                const png = new Uint8Array(await (await CardImages.canvasBlob(canvas)).arrayBuffer());
                const name = `${String(index + 1).padStart(5, '0')}_${CardCore.fileName(data, 'png')}`;
                entries[name] = png; bytes += png.byteLength; succeeded++;
                if (Object.keys(entries).length >= 5 || bytes >= 32 * 1024 * 1024) flush();
            } catch (error) { errors.push({ number: index + 1, name: inputs[index].mainName, error: error.message }); }
            finally { canvas.width = canvas.height = 0; progress.value = index + 1; }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        entries['informe.json'] = fflate.strToU8(JSON.stringify({ total: inputs.length, processed: progress.value, succeeded, cancelled: batchCancelled, errors }, null, 2));
        flush();
        label.textContent = `${batchCancelled ? 'Cancelado' : 'Terminado'}: ${succeeded} PNG, ${errors.length} errores, ${inputs.length - progress.value} sin procesar. Descarga las partes de abajo; el informe está en la última.`;
        status(label.textContent, errors.length > 0);
    } catch (error) { status('Exportación interrumpida: ' + error.message, true); }
    finally { document.getElementById('batch-cancel').hidden = true; batchRunning = false; }
}
function exportSetToCSV(setName, records) {
    const rows = [['Número', 'Nombre', 'HP', 'Etapa', 'Rareza', 'Habilidad', 'Descripción habilidad', ...[1, 2, 3].flatMap(i => [`Ataque ${i}`, `Daño ${i}`, `Coste ${i}`, `Descripción ${i}`])]];
    for (const record of [...records].sort((a, b) => Number(a.data.config?.setNumCurr || 0) - Number(b.data.config?.setNumCurr || 0))) {
        const d = CardCore.normalizeCard(record.data, defaultConfig); const c = d.config;
        rows.push([c.setNumCurr, d.mainName, d.hpVal, d.stageVal, c.rarityIcon, d.abilityName, d.abilityDesc, ...d.attacks.flatMap(a => [a.name, a.dmg + a.mod, a.cost.join(' '), a.desc])]);
    }
    const csv = '\uFEFF' + rows.map(row => row.map(CardCore.csvCell).join(',')).join('\r\n');
    CardImages.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), CardCore.safeName(setName) + '.csv');
}
window.addEventListener('beforeunload', event => {
    if (batchRunning || savingCard) { event.preventDefault(); event.returnValue = ''; }
});

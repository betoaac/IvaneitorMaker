const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('supplied Cookie Basic keeps its native Ultra size for export', () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync('assets.js', 'utf8'), context);
    const key = 'bordes/PokemonTGC_Plantilla_GALLETA_Basico.png';
    assert.notEqual(context.CARD_EXPORT_ASSETS[key], context.CARD_ASSETS[key]);
    // This supplied image uses extended WebP, with dimensions in its VP8X header.
    const data = fs.readFileSync(context.CARD_EXPORT_ASSETS[key]);
    assert.equal(data.toString('ascii', 12, 16), 'VP8X');
    assert.deepEqual([data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1], [2980, 4160]);
});

test('original export frames have full Ultra dimensions and use lossless WebP encoding', () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync('assets.js', 'utf8'), context);
    const frames = Object.entries(context.CARD_EXPORT_ASSETS || {}).filter(([key]) => /^(bordes|mascaras)\//.test(key) && !key.includes('_GALLETA_'));
    assert.equal(frames.length, 47);
    for (const [source, file] of frames) {
        const data = fs.readFileSync(file);
        let offset = 12, dimensions;
        while (offset + 8 < data.length) {
            const type = data.toString('ascii', offset, offset + 4);
            const size = data.readUInt32LE(offset + 4);
            assert.notEqual(type, 'VP8 ', source + ' must not use lossy WebP');
            if (type === 'VP8L') {
                const bits = data.readUInt32LE(offset + 9);
                dimensions = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
            }
            offset += 8 + size + (size % 2);
        }
        assert.deepEqual(dimensions, [2980, 4160], source);
    }
});

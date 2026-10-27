const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

test('imports desktop envelopes, aliases and numeric set numbers without previous-card state', () => {
    const card = Core.normalizeCard({ fullData: { pokeName: 'Pikachu', config: { setNumCurr: 0, artX: 0 }, attacks: [{ name: 'Impacto' }] } });
    assert.equal(card.mainName, 'Pikachu');
    assert.equal(card.config.setNumCurr, '0');
    assert.equal(card.config.artX, 0);
    assert.equal(card.attacks.length, 3);
    assert.deepEqual(card.attacks[0].cost, []);
    assert.equal(card.customArtData, null);
});
test('rejects malformed structures and unsafe image URLs', () => {
    for (const value of [null, [], { attacks: 'bad' }, { config: [] }, { attacks: [{ cost: {} }] }, { customArtData: 'javascript:alert(1)' }, { pokemonImgUrl: 'https://evil.example/a.png' }]) {
        assert.throws(() => Core.normalizeCard(value));
    }
    assert.throws(() => Core.normalizeCard(JSON.parse('{"__proto__":{"polluted":true}}')));
});
test('filenames are portable, bounded and tolerate numbers', () => {
    const card = Core.normalizeCard({ mainName: '../A:B?*', config: { setNumCurr: 1 } });
    const name = Core.fileName(card, 'png');
    assert.ok(!/[\\/:?*"<>|]/.test(name));
    assert.ok(name.length < 180);
});
test('CSV preserves zero, escapes quotes and neutralizes spreadsheet formulas', () => {
    assert.equal(Core.csvCell(0), '"0"');
    assert.equal(Core.csvCell('=CMD()'), '"\'=CMD()"');
    assert.equal(Core.csvCell('a"b'), '"a""b"');
});
test('background mapping selects Hada and keeps legacy Cookie/Estelar compatible', () => {
    assert.equal(Core.backgroundPath('Fairy', 'Fase2'), 'bordes/PokemonTGC_Plantilla_Hada_Fase1.png');
    const context = {};
    require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../assets.js'), 'utf8'), context);
    for (const type of ['Cookie', 'Cockie', 'Estelar']) {
        for (const stage of ['Basico', 'Fase1', 'Fase2']) {
            const expected = `web-assets/bordes/PokemonTGC_Plantilla_GALLETA_${stage === 'Basico' ? 'Basico' : 'Fase1'}.webp`;
            const key = Core.backgroundPath(Core.normalizeCard({ tcgType: type }).tcgType, stage);
            assert.equal(context.CARD_ASSETS[key], expected);
            assert.equal(context.CARD_EXPORT_ASSETS[key] || context.CARD_ASSETS[key], stage === 'Basico' ? expected.replace('web-assets/bordes/', 'web-assets/export/bordes/') : expected);
            assert.equal(Core.backgroundPath(type, stage), key);
            assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname, '..', expected)));
        }
    }
    assert.equal(Core.normalizeCard({ tcgType: 'Cookie' }).tcgType, 'Estelar');
});

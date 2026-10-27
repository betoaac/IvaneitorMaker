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
    assert.equal(Core.backgroundPath('Cockie', 'Basico'), 'bordes/PokemonTGC_Plantilla_Normal_Basico.png');
    assert.equal(Core.normalizeCard({ tcgType: 'Cookie' }).tcgType, 'Estelar');
});

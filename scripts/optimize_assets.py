"""Build web assets without changing the original image files. Pillow is required."""
import json
from pathlib import Path
from PIL import Image
from copy_export_originals import add_original_exports

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ['bordes', 'energias', 'customicons', 'mascaras', 'pokemons', 'pokemons_other', 'regulationmark', 'seticon', 'tags']
missing = [folder for folder in FOLDERS if not (ROOT / folder).is_dir()]
if missing:
    raise SystemExit('Original folders missing: ' + ', '.join(missing) + '. Build uses committed web-assets; optimization needs the local original images.')
mapping = {}
export_mapping = {}
before = after = 0
for folder in FOLDERS:
    for source in sorted((ROOT / folder).glob('*.png')):
        target = ROOT / 'web-assets' / folder / (source.stem + '.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
            with Image.open(source) as image:
                limit = (1494, 2080) if folder in ('bordes', 'mascaras') else (256, 256) if folder == 'energias' else (900, 900)
                image.thumbnail(limit, Image.Resampling.LANCZOS)
                image.save(target, 'WEBP', quality=88, method=6)
        mapping[source.relative_to(ROOT).as_posix()] = target.relative_to(ROOT).as_posix()
        before += source.stat().st_size
        after += target.stat().st_size
# Regenerate both frame variants from originals, never from the previous lossy copies.
for folder in ['bordes', 'mascaras']:
    for source in sorted((ROOT / folder).glob('*.png')):
        relative = source.relative_to(ROOT).as_posix()
        target = ROOT / 'web-assets' / 'export' / folder / (source.stem + '.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            full = image.convert('RGBA').resize((2980, 4160), Image.Resampling.LANCZOS)
            full.save(target, 'WEBP', lossless=True, exact=True, method=4)
            # Verify decoded pixels, including alpha, against the export-sized reference.
            with Image.open(target) as decoded:
                if decoded.convert('RGBA').tobytes() != full.tobytes():
                    raise RuntimeError('Lossless verification failed: ' + str(target))
            preview = full.resize((745, 1040), Image.Resampling.LANCZOS)
            preview.save(ROOT / mapping[relative], 'WEBP', quality=88, method=4)
        export_mapping[relative] = target.relative_to(ROOT).as_posix()
        print('Verified export:', source.name, flush=True)
add_original_exports(ROOT, export_mapping)
(ROOT / 'assets.js').write_text('globalThis.CARD_ASSETS = ' + json.dumps(mapping, ensure_ascii=False) + ';\n' + 'globalThis.CARD_EXPORT_ASSETS = ' + json.dumps(export_mapping, ensure_ascii=False) + ';\n', encoding='utf-8')
size = sum(p.stat().st_size for p in (ROOT / 'web-assets').rglob('*') if p.is_file())
print(f'{len(mapping)} images; {len(export_mapping)} lossless export variants; web assets {size / 1048576:.1f} MB')

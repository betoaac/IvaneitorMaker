"""Build web assets without changing the original image files. Pillow is required."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ['bordes', 'energias', 'customicons', 'mascaras', 'pokemons', 'pokemons_other', 'regulationmark', 'seticon', 'tags']
missing = [folder for folder in FOLDERS if not (ROOT / folder).is_dir()]
if missing:
    raise SystemExit('Original folders missing: ' + ', '.join(missing) + '. Build uses committed web-assets; optimization needs the local original images.')
mapping = {}
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
(ROOT / 'assets.js').write_text('globalThis.CARD_ASSETS = ' + json.dumps(mapping, ensure_ascii=False) + ';\n', encoding='utf-8')
print(f'{len(mapping)} images: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB')

"""Preserve exact original bytes for small assets used by high resolution exports."""
import json
import shutil
from pathlib import Path

def add_original_exports(root, mapping):
    for folder in ['energias', 'customicons', 'pokemons', 'pokemons_other', 'regulationmark', 'seticon', 'tags']:
        for source in sorted((root / folder).glob('*.png')):
            target = root / 'web-assets' / 'export' / folder / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            mapping[source.relative_to(root).as_posix()] = target.relative_to(root).as_posix()

if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    lines = (root / 'assets.js').read_text(encoding='utf-8').splitlines()
    preview = json.loads(lines[0].removeprefix('globalThis.CARD_ASSETS = ').removesuffix(';'))
    full = json.loads(lines[1].removeprefix('globalThis.CARD_EXPORT_ASSETS = ').removesuffix(';'))
    add_original_exports(root, full)
    (root / 'assets.js').write_text('globalThis.CARD_ASSETS = ' + json.dumps(preview, ensure_ascii=False) + ';\n' + 'globalThis.CARD_EXPORT_ASSETS = ' + json.dumps(full, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'{len(full)} full resolution export resources')

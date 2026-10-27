"""Create Cookie previews from supplied export files, without rewriting the sources."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
for stage in ('Basico', 'Fase1'):
    name = f'PokemonTGC_Plantilla_GALLETA_{stage}.webp'
    source = ROOT / 'web-assets/export/bordes' / name
    if not source.exists() or not source.stat().st_size:
        print(f'Pending: {name} (missing or empty)')
        continue
    with Image.open(source) as image:
        image.load()
        if image.size != (2980, 4160):
            raise ValueError(f'{name}: expected 2980 x 4160, got {image.size}')
        image.resize((745, 1040), Image.Resampling.LANCZOS).save(
            ROOT / 'web-assets/bordes' / name, 'WEBP', quality=88, method=4)
    print(f'Preview generated: {name}')

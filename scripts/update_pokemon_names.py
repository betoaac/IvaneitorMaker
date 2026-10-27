"""Refresh the local name catalog from the official PokeAPI data repository."""
import csv
import io
import json
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv'
text = urllib.request.urlopen(SOURCE, timeout=25).read().decode('utf-8')
rows = [{'id': int(row['id']), 'name': row['identifier']} for row in csv.DictReader(io.StringIO(text))]
if len(rows) < 1000 or len({row['id'] for row in rows}) != len(rows):
    raise SystemExit('Invalid species catalog; existing snapshot was not changed.')
target = Path(__file__).resolve().parent.parent / 'pokemon-names.json'
target.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'{len(rows)} species saved')

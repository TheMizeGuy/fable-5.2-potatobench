"""Applies exact replacements to a file from a JSON list of [old, new] pairs, failing loudly when an old text is
missing. Usage: edit.py <file> <edits.json>"""
import json, sys

path, eds = sys.argv[1], json.load(open(sys.argv[2]))
t = open(path).read()
for old, new in eds:
    if old not in t:
        sys.exit(f'not found: {old[:70]}')
    t = t.replace(old, new)
open(path, 'w').write(t)
print(len(eds), 'edits')

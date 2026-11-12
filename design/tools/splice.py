"""Replaces the lines between two marker lines (inclusive of the first, exclusive of the second) in a file with the
contents of another file. Usage: splice.py <file> <first line starts with> <stop line starts with> <replacement file>"""
import sys

path, first, stop, rep = sys.argv[1:5]
lines = open(path).read().split('\n')
a = next(i for i, l in enumerate(lines) if l.startswith(first))
b = next(i for i, l in enumerate(lines) if i > a and l.startswith(stop))
new = open(rep).read().rstrip('\n').split('\n')
lines[a:b] = new
open(path, 'w').write('\n'.join(lines))
print(f'replaced lines {a + 1}-{b} with {len(new)}')

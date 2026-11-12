"""Writes the finished frames: every design/src/*.html with
  <!--SPRITES-->              the icon sprite (icons.svg) and the portrait sprite (portraits.svg), inlined
  <!--CUT-->                  the title's engraving (src/cut.svg)
  <!--@name k="v" ...-->      a shared part, src/parts/name.html, its {{k}} filled (defaults on its first line:
                              <!--defaults k="v" ...-->); parts may hold parts
  <i class="i i-name more"></i>  an icon from the sprite: <svg class="i more"><use href="#i-name"/></svg>
Usage: assemble.py <design dir>"""
import glob, os, re, sys

d = sys.argv[1]
src = os.path.join(d, 'src')
ARG = re.compile(r'(\w+)="([^"]*)"')
PART = re.compile(r'<!--@([\w-]+)((?:\s+\w+="[^"]*")*)\s*-->')


def part(name, args):
    t = open(os.path.join(src, 'parts', name + '.html')).read()
    m = re.match(r'<!--defaults((?:\s+\w+="[^"]*")*)\s*-->\n?', t)
    vals = dict(ARG.findall(m.group(1))) if m else {}
    if m:
        t = t[m.end():]
    vals.update(args)
    return re.sub(r'\{\{(\w+)\}\}', lambda x: vals.get(x.group(1), ''), t)


def fill(t):
    for _ in range(6):
        t2 = PART.sub(lambda m: part(m.group(1), dict(ARG.findall(m.group(2)))), t)
        if t2 == t:
            break
        t = t2
    return t


def icon(m):
    attrs = m.group(3)
    a11y = ' role="img"' if 'aria-label' in attrs else ('' if 'aria-hidden' in attrs else ' aria-hidden="true"')
    return f'<svg class="i{m.group(2)}"{attrs}{a11y}><use href="#i-{m.group(1)}"/></svg>'


sprites = open(os.path.join(d, 'icons.svg')).read() + open(os.path.join(d, 'portraits.svg')).read()
cut = open(os.path.join(src, 'cut.svg')).read()
for f in sorted(glob.glob(os.path.join(src, '*.html'))):
    t = fill(open(f).read()).replace('<!--@-->', '')
    t = t.replace('<!--SPRITES-->', sprites).replace('<!--CUT-->', cut)
    t = re.sub(r'<i class="i i-([a-z0-9-]+)((?: [^"]*)?)"([^>]*)></i>', icon, t)
    left = re.findall(r'<!--@[\w-]+|\{\{\w+\}\}', t)
    if left:
        print('UNFILLED in', os.path.basename(f), left[:5])
    open(os.path.join(d, os.path.basename(f)), 'w').write(t)
    print(os.path.basename(f))

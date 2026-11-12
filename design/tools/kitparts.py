"""Writes the kit sheet's two indexes as parts: every icon in icons.svg and every portrait in portraits.svg, each
with the name the code uses."""
import os, re, sys

d = sys.argv[1]
icons = re.findall(r'<symbol id="i-([a-z0-9-]+)"', open(os.path.join(d, 'icons.svg')).read())
open(os.path.join(d, 'src/parts/icon-index.html'), 'w').write(
    '<div class="k-icons">' + ''.join(f'<figure><i class="i i-{n}"></i><span>{n}</span></figure>' for n in icons) + '</div>\n')
looks = {
    'farmer': ('You', '--shirt:#b8402e;--hat:#d8c48a;--skin:#e8b996;--hair:#5a3d24'),
    'cap-moustache': ('Normand', '--shirt:#2f6f9f;--hat:#3b3f45;--skin:#d9a47c;--hair:#2b211a'),
    'felt-beard': ('Alcide', '--shirt:#d9a441;--hat:#8c5a2b;--skin:#c48a62;--hair:#8a6a3c'),
    'kerchief': ('Verna', '--shirt:#6b4c8a;--hat:#9c3226;--skin:#f0c8a8;--hair:#7a3b1f'),
    'curls': ('Lucien', '--shirt:#e7e0cf;--hat:#27425c;--skin:#a8704c;--hair:#1c1c1c'),
    'cap-glasses': ('Wendell', '--shirt:#2e7d6b;--hat:#27425c;--skin:#d9a47c;--hair:#b9b4a8'),
}
cuts = re.findall(r'<symbol id="bust-([a-z-]+)"', open(os.path.join(d, 'portraits.svg')).read())
html = '<div class="k-busts">' + ''.join(
    f'<figure><svg class="bust" style="{looks[c][1]}"><use href="#bust-{c}"/></svg><span>bust-{c}</span><span class="k-lab">{looks[c][0]}</span></figure>' for c in cuts) + '</div>\n'
html += '<div class="k-busts small" style="margin-top:12px">' + ''.join(f'<svg class="bust" style="{looks[c][1]}"><use href="#bust-{c}"/></svg>' for c in cuts) + '<span class="k-lab">at 40 px, the size of a time-book cell: told apart by hat and face</span></div>\n'
open(os.path.join(d, 'src/parts/portrait-index.html'), 'w').write(html)
print(len(icons), 'icons', len(cuts), 'portraits')

"""Gives every portrait in design/src its person: the cut and the colours, chosen by the shirt colour the frame
already names (the shirt is the person's colour on the land, from src/game/looks.ts)."""
import glob, re, sys

WHO = {
    '#b8402e': ('farmer', '--shirt:#b8402e;--hat:#d8c48a;--skin:#e8b996;--hair:#5a3d24'),        # You
    '#2f6f9f': ('cap-moustache', '--shirt:#2f6f9f;--hat:#3b3f45;--skin:#d9a47c;--hair:#2b211a'),  # Normand
    '#d9a441': ('felt-beard', '--shirt:#d9a441;--hat:#8c5a2b;--skin:#c48a62;--hair:#8a6a3c'),     # Alcide
    '#6b4c8a': ('kerchief', '--shirt:#6b4c8a;--hat:#9c3226;--skin:#f0c8a8;--hair:#7a3b1f'),       # Verna
    '#e7e0cf': ('curls', '--shirt:#e7e0cf;--hat:#27425c;--skin:#a8704c;--hair:#1c1c1c'),          # Lucien
    '#2e7d6b': ('cap-glasses', '--shirt:#2e7d6b;--hat:#27425c;--skin:#d9a47c;--hair:#b9b4a8'),    # Wendell
    '#c96f2c': ('kerchief', '--shirt:#c96f2c;--hat:#2f507a;--skin:#e8b996;--hair:#b9b4a8'),
    '#a23b62': ('cap-moustache', '--shirt:#a23b62;--hat:#c9c2b0;--skin:#c48a62;--hair:#b9b4a8'),
}
pat = re.compile(r'<svg class="(bust[^"]*)" style="--shirt:(#[0-9a-f]{6})[^"]*"><use href="#bust-[a-z-]+"/></svg>')
for f in sorted(glob.glob(sys.argv[1] + '/*.html')):
    t = open(f).read()
    n = 0
    def sub(m):
        global n
        n += 1
        cut, style = WHO[m.group(2)]
        return f'<svg class="{m.group(1)}" style="{style}"><use href="#bust-{cut}"/></svg>'
    t = pat.sub(sub, t)
    open(f, 'w').write(t)
    print(f.split('/')[-1], n)

"""Writes design/src/parts/pin-<person>.html: a person's face pin on the land, in their shirt colour, with their
portrait. Arguments when used: x, y, cls (" is-picked", " needs", " is-hurt"), badge (a part name), label."""
import os, sys

PEOPLE = {
    'you': ('You', 'farmer', '#b8402e', '--shirt:#b8402e;--hat:#d8c48a;--skin:#e8b996;--hair:#5a3d24'),
    'normand': ('Normand', 'cap-moustache', '#2f6f9f', '--shirt:#2f6f9f;--hat:#3b3f45;--skin:#d9a47c;--hair:#2b211a'),
    'alcide': ('Alcide', 'felt-beard', '#d9a441', '--shirt:#d9a441;--hat:#8c5a2b;--skin:#c48a62;--hair:#8a6a3c'),
    'verna': ('Verna', 'kerchief', '#6b4c8a', '--shirt:#6b4c8a;--hat:#9c3226;--skin:#f0c8a8;--hair:#7a3b1f'),
    'lucien': ('Lucien', 'curls', '#e7e0cf', '--shirt:#e7e0cf;--hat:#27425c;--skin:#a8704c;--hair:#1c1c1c'),
    'wendell': ('Wendell', 'cap-glasses', '#2e7d6b', '--shirt:#2e7d6b;--hat:#27425c;--skin:#d9a47c;--hair:#b9b4a8'),
}
out = sys.argv[1]
for key, (name, cut, c, look) in PEOPLE.items():
    t = (f'<!--defaults x="0" y="0" cls="" badge="" label="{name}" name=""-->\n'
         f'<span class="pin{{{{cls}}}}" style="left:{{{{x}}}}px;top:{{{{y}}}}px;--c:{c}" role="img" aria-label="{{{{label}}}}">'
         f'<i class="foot"></i><i class="stem"></i><span class="head"><svg class="bust" style="{look}"><use href="#bust-{cut}"/></svg></span>'
         f'<!--@{{{{badge}}}}--><!--@{{{{name}}}}--></span>\n')
    open(os.path.join(out, f'pin-{key}.html'), 'w').write(t)
    open(os.path.join(out, f'name-{key}.html'), 'w').write(f'<span class="name">{name}</span>')
open(os.path.join(out, 'badge-needs.html'), 'w').write('<span class="badge" aria-hidden="true">!</span>')
open(os.path.join(out, 'badge-hurt.html'), 'w').write('<span class="badge" aria-hidden="true">+</span>')
print('pins written')

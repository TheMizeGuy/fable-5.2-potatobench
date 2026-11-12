import os, sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
UNI = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x2010, 0x2028)) + [
    0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x2116, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215, 0x2009, 0x200A, 0x2007, 0x2008]
FEATS = ['kern', 'tnum', 'lnum', 'onum', 'pnum', 'case', 'frac', 'numr', 'dnom', 'sups', 'ordn', 'locl', 'ccmp', 'mark', 'mkmk']

jobs = [
    ('LibreCaslonText[wght].ttf', 'caslon-text.woff2', None),
    ('LibreCaslonText-Italic[wght].ttf', 'caslon-text-italic.woff2', None),
    ('LeagueGothic[wdth].ttf', 'league-gothic.woff2', None),
    ('BigShouldersStencil[opsz,wght].ttf', 'big-shoulders-stencil.woff2', {'opsz': 36, 'wght': 750}),
    ('CourierPrime-Regular.ttf', 'courier-prime.woff2', None),
]
for name, dest, inst in jobs:
    f = TTFont(os.path.join(src, name))
    if inst:
        f = instancer.instantiateVariableFont(f, inst)
    opts = subset.Options()
    opts.layout_features = FEATS
    opts.flavor = 'woff2'
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNI)
    s.subset(f)
    p = os.path.join(out, dest)
    f.flavor = 'woff2'
    f.save(p)
    print(dest, os.path.getsize(p))

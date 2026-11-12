"""The title's engraved cut: a potato plant in flower, lifted to show its tubers, drawn the way a seed catalogue's
engraver cut it: outline, a vein, and parallel shading strokes, all in one ink. Writes design/src/cut.svg."""
import math, random, sys

rnd = random.Random(5)
W, H = 360, 420
GROUND = 262
INK = 'currentColor'
out = []


def P(d, w=1.0, extra=''):
    out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w:.2f}" stroke-linecap="round" {extra}/>')


def fmt(pts):
    return ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts)


def leaflet(cx, cy, ang, L, Wd, shade_side=1):
    """An ovate leaflet: outline, midvein, shading strokes on one side."""
    ca, sa = math.cos(ang), math.sin(ang)
    def at(u, v):  # u along the leaf 0..1, v across -1..1
        x = u * L
        y = v * Wd * math.sin(math.pi * min(1, u * 1.05)) ** 0.8
        return cx + x * ca - y * sa, cy + x * sa + y * ca
    top = [at(u / 16, 1) for u in range(17)]
    bot = [at(u / 16, -1) for u in range(16, -1, -1)]
    out.append(f'<path d="M{fmt(top[:1])} L{fmt(top[1:])} L{fmt(bot)} Z" fill="#f6f1e4" stroke="{INK}" stroke-width="1.05" stroke-linejoin="round"/>')
    P(f'M{fmt([at(0.02, 0)])} L{fmt([at(0.9, 0.02)])}', 0.7)
    for k in range(1, 8):
        u = k / 8.5
        a = at(u, 0)
        b = at(u + 0.08, shade_side * 0.92)
        P(f'M{a[0]:.1f} {a[1]:.1f} L{b[0]:.1f} {b[1]:.1f}', 0.55)
        if k % 2 == 0:
            c = at(u + 0.04, shade_side * 0.45)
            d = at(u + 0.12, shade_side * 0.95)
            P(f'M{c[0]:.1f} {c[1]:.1f} L{d[0]:.1f} {d[1]:.1f}', 0.45)
    for k in range(1, 5):
        u = k / 5.5
        a = at(u, 0)
        b = at(u + 0.07, -shade_side * 0.8)
        P(f'M{a[0]:.1f} {a[1]:.1f} L{b[0]:.1f} {b[1]:.1f}', 0.4, 'stroke-opacity=".7"')


def leaf(x0, y0, ang, length, scale=1.0, side=1):
    """A compound potato leaf: a curving rachis with paired leaflets and one at the tip."""
    pts = []
    for i in range(13):
        t = i / 12
        a = ang + side * 0.35 * t
        pts.append((x0 + math.cos(a) * length * t, y0 + math.sin(a) * length * t - 10 * math.sin(math.pi * t) * scale))
    P('M' + fmt(pts[:1]) + ' L' + fmt(pts[1:]), 1.4)
    for j, t in enumerate([0.28, 0.55, 0.8]):
        i = int(t * 12)
        x, y = pts[i]
        a = math.atan2(pts[i + 1][1] - y, pts[i + 1][0] - x)
        s = scale * (0.75 + 0.25 * t)
        leaflet(x, y, a - 1.0, 36 * s, 13 * s, 1)
        leaflet(x, y, a + 1.0, 36 * s, 13 * s, -1)
        if j < 2:
            xm, ym = pts[i + 2]
            leaflet(xm, ym, a - 1.25, 12 * s, 4.8 * s, 1)
            leaflet(xm, ym, a + 1.25, 12 * s, 4.8 * s, -1)
    x, y = pts[-1]
    a = math.atan2(y - pts[-2][1], x - pts[-2][0])
    leaflet(x, y, a, 40 * scale, 15 * scale, side)


def flower(cx, cy, r, rot):
    pts = []
    for k in range(10):
        a = rot + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.62
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    out.append(f'<path d="M{fmt(pts[:1])} L{fmt(pts[1:])} Z" fill="#f6f1e4" stroke="{INK}" stroke-width=".9" stroke-linejoin="round"/>')
    for k in range(5):
        a = rot + k * 2 * math.pi / 5
        P(f'M{cx + math.cos(a) * r * .25:.1f} {cy + math.sin(a) * r * .25:.1f} L{cx + math.cos(a) * r * .8:.1f} {cy + math.sin(a) * r * .8:.1f}', .45)
    out.append(f'<path d="M{cx:.1f} {cy - r * .38:.1f} l{r * .2:.1f} {r * .38:.1f} l{-r * .2:.1f} {r * .38:.1f} l{-r * .2:.1f} {-r * .38:.1f} z" fill="{INK}"/>')


def tuber(cx, cy, rx, ry, rot):
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({rot} {cx} {cy})" fill="#f6f1e4" stroke="{INK}" stroke-width="1.2"/>')
    # shading: short parallel strokes along the lower side, as the engraver models a round form
    for k in range(-6, 7):
        t = k / 7
        x = cx + t * rx * 0.92
        h = ry * math.sqrt(max(0, 1 - t * t))
        y1 = cy + h * 0.25
        y2 = cy + h * 0.92
        P(f'M{x:.1f} {y1:.1f} L{x + 1.4:.1f} {y2:.1f}', .55, f'transform="rotate({rot} {cx} {cy})"')
    for e in range(3):
        ex = cx + (rnd.random() - 0.5) * rx * 1.1
        ey = cy - ry * 0.3 + (rnd.random() - 0.5) * ry * 0.5
        P(f'M{ex - 2:.1f} {ey:.1f} q2 -1.6 4 0', .8, f'transform="rotate({rot} {cx} {cy})"')


# the soil, cut away in section: horizontal engraved lines, closer together as they go down
y = GROUND + 4
gap = 5.0
while y < H - 4:
    x0 = 18 + rnd.random() * 10
    segs = []
    x = x0
    while x < W - 20:
        ln = 20 + rnd.random() * 50
        segs.append(f'M{x:.1f} {y + (rnd.random() - .5) * 1.2:.1f} h{min(ln, W - 20 - x):.1f}')
        x += ln + 3 + rnd.random() * 6
    P(' '.join(segs), .55, 'stroke-opacity=".75"')
    y += gap
    gap = max(2.6, gap * 0.94)
# the hill of soil the plant stands in, and the ground line
P(f'M10 {GROUND} C80 {GROUND - 2} 120 {GROUND - 18} 180 {GROUND - 20} S280 {GROUND - 2} {W - 10} {GROUND}', 1.6)
for k in range(14):
    x = 120 + k * 9
    P(f'M{x} {GROUND - 14 + abs(k - 7) * 1.6:.1f} l-5 7', .5)

# stolons and tubers below
for (x2, y2) in [(84, 330), (132, 382), (232, 372), (284, 316), (182, 404)]:
    P(f'M180 {GROUND - 4} C{(180 + x2) / 2:.1f} {GROUND + 20} {x2:.1f} {y2 - 40} {x2} {y2}', 1.1)
# the white of the soil around each tuber, so the engraved section breaks round it
for (cx, cy, rx, ry, rot) in [(84, 336, 30, 21, -14), (134, 388, 24, 17, 10), (232, 378, 33, 22, 8), (286, 322, 22, 16, -22), (182, 404, 18, 13, 0)]:
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx + 5}" ry="{ry + 5}" transform="rotate({rot} {cx} {cy})" fill="#f6f1e4"/>')
    tuber(cx, cy, rx, ry, rot)
# fine roots
for k in range(9):
    a = math.pi * (0.25 + 0.5 * rnd.random())
    P(f'M180 {GROUND - 2} q{math.cos(a) * 20:.1f} {math.sin(a) * 14:.1f} {math.cos(a) * 40:.1f} {math.sin(a) * 34:.1f}', .5)

# stems
P(f'M178 {GROUND - 18} C170 200 152 136 112 92', 2.6)
P(f'M182 {GROUND - 18} C188 196 204 136 246 88', 2.6)
P(f'M180 {GROUND - 18} C182 190 176 110 180 52', 2.4)
P(f'M179 {GROUND - 18} C170 210 130 196 84 176', 2.0)
P(f'M181 {GROUND - 18} C194 214 238 196 282 182', 2.0)
# leaves
leaf(176, 214, math.pi * 1.02, 120, 1.0, 1)
leaf(186, 210, -math.pi * 0.0, 120, 1.0, -1)
leaf(170, 160, math.pi * 1.18, 104, 0.9, 1)
leaf(190, 156, -math.pi * 0.18, 104, 0.9, -1)
leaf(176, 112, math.pi * 1.36, 72, 0.75, 1)
leaf(184, 108, -math.pi * 0.38, 74, 0.75, -1)
# the flowers: a cyme of five at the top of the main stem, and two smaller ones
for (cx, cy, r, rot) in [(180, 42, 15, -.3), (158, 30, 13.5, .2), (202, 30, 13.5, .5), (168, 10, 12, .9), (194, 8, 11.5, 0.1)]:
    P(f'M180 52 L{cx} {cy + r * .4:.1f}', .9)
    flower(cx, cy, r, rot)
for (cx, cy, r, rot) in [(112, 84, 11, .4), (96, 72, 9.5, 1.1), (246, 80, 11, .2), (262, 68, 9, .7)]:
    flower(cx, cy, r, rot)

svg = (f'<svg class="cut" viewBox="0 0 {W} {H}" role="img" aria-label="An engraving of a potato plant in flower, lifted to show its tubers">'
       + ''.join(out) + '</svg>')
open(sys.argv[1], 'w').write(svg + '\n')
print(len(svg), 'bytes')

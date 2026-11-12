"""The reveal: the printed face of the potato house's platform scale. Its rim carries the grades as they come off the
grader (in the printer's tints), the needle sweeps round to the gross weight. Writes design/src/parts/dial.html."""
import math, sys

C, R = 235, 214
A0, A1 = -225, 45              # degrees, 0 cwt to 2,000 cwt, clockwise
MAX = 20                       # hundreds of cwt
grades = [('US No. 1', 10.13, 'url(#d-g1)'), ('US No. 2', 2.11, 'url(#d-g4)'), ('B size', 1.36, 'url(#d-g3)'), ('Large', 0.14, 'url(#d-g2)'), ('Culls', 0.56, 'none')]
gross = sum(g[1] for g in grades)


def ang(v):
    return math.radians(A0 + (A1 - A0) * v / MAX)


def pt(v, r):
    a = ang(v)
    return C + r * math.cos(a), C + r * math.sin(a)


def arc(v0, v1, r0, r1):
    large = 1 if (v1 - v0) / MAX * (A1 - A0) > 180 else 0
    x0, y0 = pt(v0, r1); x1, y1 = pt(v1, r1); x2, y2 = pt(v1, r0); x3, y3 = pt(v0, r0)
    return f'M{x0:.1f} {y0:.1f}A{r1} {r1} 0 {large} 1 {x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}A{r0} {r0} 0 {large} 0 {x3:.1f} {y3:.1f}Z'


o = ['<svg viewBox="0 0 470 470" role="img" aria-label="The scale: the needle sweeping round to 1,430 cwt, past US No. 1, US No. 2, B size, large and culls">',
     '<defs>',
     '<pattern id="d-g2" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1h4" stroke="#1e1c19" stroke-width="1.4"/></pattern>',
     '<pattern id="d-g3" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#1e1c19"/></pattern>',
     '<pattern id="d-g4" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v5" stroke="#1e1c19" stroke-width="1.5"/></pattern>',
     '<pattern id="d-g1" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#1e1c19"/></pattern>',
     '<path id="d-top" d="M145 235a90 90 0 0 1 180 0"/>',
     '</defs>',
     f'<circle cx="{C}" cy="{C}" r="232" fill="#2c2620"/>',
     f'<circle cx="{C}" cy="{C}" r="224" fill="#f6f1e4" stroke="#1e1c19" stroke-width="2"/>',
     f'<circle cx="{C}" cy="{C}" r="160" fill="none" stroke="#1e1c19" stroke-width="1"/>']
# the grade band on the rim
v = 0
mids = []
for name, w, fill in grades:
    o.append(f'<path d="{arc(v, v + w, 176, 200)}" fill="{fill}" stroke="#1e1c19" stroke-width="1.2"/>')
    mids.append((name, v + w / 2, w))
    v += w
o.append(f'<path d="{arc(gross, MAX, 176, 200)}" fill="none" stroke="#1e1c19" stroke-width="1" stroke-dasharray="3 3"/>')
# graduations
for k in range(0, MAX * 5 + 1):
    val = k / 5
    big = k % 5 == 0
    x0, y0 = pt(val, 172 if big else 166)
    x1, y1 = pt(val, 152)
    o.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="#1e1c19" stroke-width="{2.2 if big else 1}"/>')
    if big and k % 10 == 0:
        x, y = pt(val, 132)
        o.append(f'<text x="{x:.1f}" y="{y + 9:.1f}" text-anchor="middle" font-family="Gothic" font-size="28" fill="#1e1c19">{int(val)}</text>')
# the grades named outside the band where there is room
for name, mid, w in mids:
    if w < 1:
        continue
    x, y = pt(mid, 208)
    rot = math.degrees(ang(mid)) + 90
    o.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" font-family="Gothic" font-size="14" letter-spacing="1.5" fill="#1e1c19" transform="rotate({rot:.1f} {x:.1f} {y:.1f})">{name.upper()}</text>')
o.append('<text font-family="Gothic" font-size="15" letter-spacing="3" fill="#4b463d"><textPath href="#d-top" startOffset="50%" text-anchor="middle">FARMERS’ PLATFORM SCALE</textPath></text>')
o.append(f'<text x="{C}" y="{C + 62}" text-anchor="middle" font-family="Gothic" font-size="18" letter-spacing="3" fill="#4b463d">CWT × 100</text>')
o.append(f'<text x="{C}" y="{C + 86}" text-anchor="middle" font-family="Caslon" font-style="italic" font-size="15" fill="#4b463d">capacity 2,000 cwt</text>')
# the needle, with two faint places it has just swept through
for val, op in [(11.6, .12), (13.1, .22)]:
    x, y = pt(val, 168)
    o.append(f'<line x1="{C}" y1="{C}" x2="{x:.1f}" y2="{y:.1f}" stroke="#9c3226" stroke-width="5" stroke-linecap="round" opacity="{op}"/>')
x, y = pt(gross, 170)
xb, yb = pt(gross + MAX / 2, 30)
o.append(f'<line x1="{xb:.1f}" y1="{yb:.1f}" x2="{x:.1f}" y2="{y:.1f}" stroke="#9c3226" stroke-width="5" stroke-linecap="round"/>')
o.append(f'<circle cx="{C}" cy="{C}" r="15" fill="#1e1c19"/><circle cx="{C}" cy="{C}" r="5" fill="#9c3226"/>')
o.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(o) + '\n')
print('gross', round(gross * 100))

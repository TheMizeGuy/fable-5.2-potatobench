"""Writes a selection drawn on the land as a part: a dashed line round the given corners, a registration mark at
each. Usage: regmarks.py <out part file> x1,y1 x2,y2 ..."""
import sys

out, pts = sys.argv[1], [tuple(float(v) for v in p.split(',')) for p in sys.argv[2:]]
poly = ' '.join(f'{x:.0f},{y:.0f}' for x, y in pts)
marks = []
for x, y in pts:
    cross = f'M{x - 13:.0f} {y:.0f}h26M{x:.0f} {y - 13:.0f}v26'
    marks.append(f'<path class="u" d="{cross}"/><circle class="u" cx="{x:.0f}" cy="{y:.0f}" r="7" style="stroke:rgba(20,16,10,.6);stroke-width:4.5;fill:none"/>'
                 f'<circle cx="{x:.0f}" cy="{y:.0f}" r="7"/><path d="{cross}"/>')
svg = (f'<svg class="select" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
       f'<polygon class="under" points="{poly}"/><polygon class="line" points="{poly}"/><g class="reg">{"".join(marks)}</g></svg>\n')
open(out, 'w').write(svg)
print('ok')

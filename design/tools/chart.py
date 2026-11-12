"""The year's cash as a plain line in ink, the way a clerk would rule it in the back of the account book.
Writes design/src/parts/cash-chart.html."""
import sys

months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
cash = [18000, 4200, -9800, -22820, -31400, -38790, 11200, 7600, 3900, 900, -2600, -6351]
W, H, L, T, B = 440, 210, 46, 10, 24
lo, hi = -40000, 20000
x = lambda i: L + i * (W - L - 6) / (len(months) - 1)
y = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)
o = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Cash through the year: $18,000 in April, down to −$38,790 at the dig in September, up with the sales in October, −$6,351 at the year end">']
for v in (20000, 0, -20000, -40000):
    o.append(f'<line class="{"zero" if v == 0 else "grid-l"}" x1="{L}" x2="{W - 6}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
    o.append(f'<text x="{L - 6}" y="{y(v) + 4:.1f}" text-anchor="end">{"0" if v == 0 else f"{v // 1000:+d}k".replace("+", "")}</text>')
for i, m in enumerate(months):
    if i % 3 == 0 or i == len(months) - 1:
        o.append(f'<text x="{x(i):.1f}" y="{H - 4}" text-anchor="middle">{m}</text>')
pts = ' '.join(f'{x(i):.1f},{y(v):.1f}' for i, v in enumerate(cash))
o.append(f'<polyline class="ln" points="{pts}"/>')
o.append(f'<circle cx="{x(5):.1f}" cy="{y(cash[5]):.1f}" r="3.5" fill="#1e1c19"/><text class="lab" x="{x(5) + 8:.1f}" y="{y(cash[5]) + 4:.1f}">dig day</text>')
o.append(f'<circle cx="{x(11):.1f}" cy="{y(cash[11]):.1f}" r="3.5" fill="#9c3226"/>')
o.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(o) + '\n')
print('ok')

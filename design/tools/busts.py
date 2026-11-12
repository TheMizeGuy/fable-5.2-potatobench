"""The portrait cuts: one engraver's hand, a different head for each person, tinted by CSS custom properties in the
colours the person wears on the land (--shirt, --hat, --skin, --hair). Writes design/src/busts.svg."""
import sys

K = 'stroke="#1e1c19" stroke-width="1"'
BG = '<ellipse cx="24" cy="24" rx="21.5" ry="22.5" fill="#efe6cf"/>'
RIM = '<ellipse cx="24" cy="24" rx="21.5" ry="22.5" fill="none" stroke="#1e1c19" stroke-width="1.2"/>'


def body(collar='v'):
    c = {'v': '<path d="M19.5 33.6l4.5 6 4.5-6" fill="none" ' + K + '/>',
         'shirt': '<path d="M18.8 33.4l5.2 4.2 5.2-4.2M24 37.6V48" fill="none" ' + K + '/>',
         'over': '<path d="M14 49l2.5-13M34 49l-2.5-13" fill="none" ' + K + '/><path d="M19.5 33.6l4.5 6 4.5-6" fill="none" ' + K + '/>'}[collar]
    return ('<path d="M5 49c1.5-11 9-15.5 19-15.5S41.5 38 43 49z" fill="var(--shirt)" ' + K + '/>'
            '<path d="M5 49c1.5-11 9-15.5 19-15.5S41.5 38 43 49z" fill="url(#hatch2)"/>' + c +
            '<path d="M20.5 27h7v7.2h-7z" fill="var(--skin)" ' + K + '/>')


def face(rx=7.2, ry=8.2, cy=22, eyes=19.8):
    return (f'<ellipse cx="24" cy="{cy}" rx="{rx}" ry="{ry}" fill="var(--skin)" {K}/>'
            f'<path d="M{24 - rx + 1.4} {cy + 3.5}c1.6 3.6 3.4 5 {rx - 1.4} 5s3.8-1.4 {rx - 1.4}-5" fill="none" stroke="#1e1c19" stroke-opacity=".3" stroke-width=".8"/>'
            f'<circle cx="21.2" cy="{eyes + 2}" r=".95" fill="#1e1c19"/><circle cx="26.8" cy="{eyes + 2}" r=".95" fill="#1e1c19"/>'
            f'<path d="M23.9 {eyes + 3}l-.7 2.8h1.4" fill="none" stroke="#1e1c19" stroke-width=".7" stroke-opacity=".7"/>')


def mouth(cy=22):
    return f'<path d="M22.2 {cy + 5.6}h3.6" stroke="#1e1c19" stroke-width=".8" stroke-opacity=".7"/>'


P = {
    # the farmer: a wide straw hat, the brim's weave shown by a dotted rule
    'farmer': body('shirt') + face() + mouth() +
        '<ellipse cx="24" cy="15.8" rx="14.5" ry="3.6" fill="var(--hat)" ' + K + '/>'
        '<ellipse cx="24" cy="15.8" rx="11.5" ry="2.4" fill="none" stroke="#1e1c19" stroke-width=".7" stroke-dasharray="1 1.2" stroke-opacity=".6"/>'
        '<path d="M17.4 15.4c0-5.6 2.8-8.2 6.6-8.2s6.6 2.6 6.6 8.2c-2 .8-4.4 1.1-6.6 1.1s-4.6-.3-6.6-1.1z" fill="var(--hat)" ' + K + '/>'
        '<path d="M17.6 13.2c2 .7 4.2 1 6.4 1s4.4-.3 6.4-1" fill="none" stroke="#9c3226" stroke-width="1.6"/>',
    # a flat cap pulled down, a heavy moustache, a square jaw
    'cap-moustache': body('v') +
        '<path d="M16.8 21c0 6.4 2.8 9.6 7.2 9.6s7.2-3.2 7.2-9.6v-1.6H16.8z" fill="var(--skin)" ' + K + '/>'
        '<circle cx="21.2" cy="21.6" r=".95" fill="#1e1c19"/><circle cx="26.8" cy="21.6" r=".95" fill="#1e1c19"/>'
        '<path d="M19.8 19.8h2.8M25.4 19.8h2.8" stroke="#1e1c19" stroke-width="1"/>'
        '<path d="M20 26.4c1.4-1.6 2.8-1.6 4-.6 1.2-1 2.6-1 4 .6-1.6.4-2.8.2-4-.4-1.2.6-2.4.8-4 .4z" fill="var(--hair)" ' + K + '/>'
        '<path d="M15.6 19.6c0-5.4 3.4-8.6 8.4-8.6s8.6 2.6 9.6 7.2l3.6 1.6c-3.4 1.2-8.4 1.4-13.2.8-3.4-.2-6-.4-8.4-1z" fill="var(--hat)" ' + K + '/>'
        '<path d="M15.6 19.6c0-5.4 3.4-8.6 8.4-8.6s8.6 2.6 9.6 7.2" fill="url(#hatch2)"/>'
        '<path d="M20 11.6l1.6 7.8" stroke="#1e1c19" stroke-width=".7" stroke-opacity=".6"/>',
    # a tall felt hat with a dented crown, a full beard
    'felt-beard': body('over') + face(rx=7, ry=8, cy=22.6) +
        '<path d="M17.2 24.4c0 5.6 2.6 8.6 6.8 8.6s6.8-3 6.8-8.6c-1.6 1.6-3.6 2.2-6.8 2.2s-5.2-.6-6.8-2.2z" fill="var(--hair)" ' + K + '/>'
        '<path d="M22 27.6h4" stroke="#efe6cf" stroke-width=".9"/>'
        '<path d="M8.6 16.4c4-1.6 9.2-2.4 15.4-2.4s11.4.8 15.4 2.4c-4 1.8-9.4 2.6-15.4 2.6S12.6 18.2 8.6 16.4z" fill="var(--hat)" ' + K + '/>'
        '<path d="M16.6 16.2l.8-8.4c2-1.6 4.2-2 6.6-1.2 2.4-.8 4.6-.4 6.6 1.2l.8 8.4c-2.4.6-4.8.8-7.4.8s-5-.2-7.4-.8z" fill="var(--hat)" ' + K + '/>'
        '<path d="M16.6 16.2l.8-8.4c2-1.6 4.2-2 6.6-1.2 2.4-.8 4.6-.4 6.6 1.2l.8 8.4" fill="url(#hatch)"/>'
        '<path d="M24 6.6v3.4" stroke="#1e1c19" stroke-width=".8"/>'
        '<path d="M16.8 14.2c2.4.6 4.8.9 7.2.9s4.8-.3 7.2-.9" fill="none" stroke="#1e1c19" stroke-width="1.6"/>',
    # a kerchief tied over the hair, the knot at the nape; a fringe showing
    'kerchief': body('v') + face(rx=6.8, ry=7.8, cy=22.4) + mouth(22.4) +
        '<path d="M17.4 19.2c1.4-2.4 3.8-3.6 6.6-3.6s5.2 1.2 6.6 3.6c-2-.8-4.2-1.2-6.6-1.2s-4.6.4-6.6 1.2z" fill="var(--hair)" ' + K + '/>'
        '<path d="M15.4 22c-.6-7.8 3.2-12.4 8.6-12.4s9.2 4.6 8.6 12.4c-.4-3.8-1.6-5.6-2.4-6.6-1.8-1.2-4-1.8-6.2-1.8s-4.4.6-6.2 1.8c-.8 1-2 2.8-2.4 6.6z" fill="var(--hat)" ' + K + '/>'
        '<path d="M15.4 22c-.6-7.8 3.2-12.4 8.6-12.4s9.2 4.6 8.6 12.4" fill="url(#dots)"/>'
        '<path d="M32.4 20.6l4 3.4-2.6 1.4 1 3.2-3.6-3.6z" fill="var(--hat)" ' + K + '/>',
    # bare-headed, a mass of curly hair, young
    'curls': body('shirt') + face(rx=7, ry=8.4, cy=22.4) + mouth(22.4) +
        '<path d="M16.4 21c-2-1-2.4-3.6-1-5-1-2.2.4-4.6 2.6-4.8.4-2.4 3-3.6 5-2.6 1.8-1.6 4.6-1 5.6.8 2.4-.2 4 2 3.4 4.2 1.6 1.2 1.6 3.6.2 4.6.4 1.2 0 2.4-1.2 3-.4-2.6-1.6-4.4-3.6-5.2-1.6 1-4 1.2-6 .6-1.6 1-3.6 1.4-5 1.2-.2 1.2-.2 2.2 0 3.2z" fill="var(--hair)" ' + K + '/>'
        '<path d="M19 13.6c.8-.6 1.6-.6 2.4 0M24.4 12.2c.8-.6 1.6-.6 2.4 0M28.6 14.6c.8-.4 1.6-.2 2.2.4M17.2 17.2c.6-.6 1.4-.8 2.2-.4" fill="none" stroke="#efe6cf" stroke-width=".7" stroke-opacity=".55"/>',
    # an engineer's cap with a stiff peak, round spectacles
    'cap-glasses': body('over') + face() + mouth() +
        '<circle cx="21.2" cy="21.8" r="2.3" fill="none" stroke="#1e1c19" stroke-width=".9"/><circle cx="26.8" cy="21.8" r="2.3" fill="none" stroke="#1e1c19" stroke-width=".9"/>'
        '<path d="M23.5 21.6h1" stroke="#1e1c19" stroke-width=".9"/>'
        '<path d="M16.2 17.4V12c1.6-2.4 4.4-3.6 7.8-3.6s6.2 1.2 7.8 3.6v5.4c-2.4.6-5 .9-7.8.9s-5.4-.3-7.8-.9z" fill="var(--hat)" ' + K + '/>'
        '<path d="M16.2 17.4V12c1.6-2.4 4.4-3.6 7.8-3.6s6.2 1.2 7.8 3.6v5.4" fill="url(#stripe)"/>'
        '<path d="M15.4 17.2c2.6 1.4 5.6 2 8.6 2s6-.6 8.6-2l-.4 2.4c-2.6 1-5.2 1.4-8.2 1.4s-5.6-.4-8.2-1.4z" fill="#1e1c19"/>',
}

DEFS = '''  <defs>
    <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v3" stroke="#1e1c19" stroke-opacity=".22" stroke-width=".9"/></pattern>
    <pattern id="hatch2" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><path d="M0 0v2.4" stroke="#1e1c19" stroke-opacity=".3" stroke-width=".8"/></pattern>
    <pattern id="stripe" width="2.6" height="2.6" patternUnits="userSpaceOnUse"><path d="M1.3 0v2.6" stroke="#efe6cf" stroke-opacity=".75" stroke-width=".8"/></pattern>
    <pattern id="dots" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".7" fill="#efe6cf" fill-opacity=".85"/></pattern>
    <clipPath id="oval"><ellipse cx="24" cy="24" rx="21.5" ry="22.5"/></clipPath>
  </defs>'''

out = ['<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">', DEFS]
for k, v in P.items():
    out.append(f'  <symbol id="bust-{k}" viewBox="0 0 48 48">{BG}<g clip-path="url(#oval)"><rect width="48" height="48" fill="url(#hatch)"/>{v}</g>{RIM}</symbol>')
out.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
print(len(P), 'portraits')

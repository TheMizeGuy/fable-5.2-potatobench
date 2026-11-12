"""The icon family, drawn once: a 24 unit grid, a 1.7 unit stroke with square ends and mitred corners (a ruled,
printed line, not a marker), and solid ink only where a printer's cut would carry a mass (a seed, a spot of blight).
Writes design/icons.svg: one sprite, every symbol drawn in currentColor so it prints in the ink of its element.
Frames inline it (tools/assemble.py) and use <svg class="i"><use href="#i-name"/></svg>."""
import sys, urllib.parse

S = 'fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter"'
F = 'fill="currentColor" stroke="none"'

I = {
    # the nine field orders
    'plant': f'<path {S} d="M3 14.5h18M12 14V7.5M12 10.5C9 10.5 7 8.6 6.6 6c2.6 0 4.9 1.7 5.4 4.5zM12 9.2c2.4 0 4.3-1.7 4.8-4 -2.5 0-4.4 1.5-4.8 4z"/><ellipse {F} cx="12" cy="18.4" rx="3.2" ry="2"/>',
    'hill': f'<path {S} d="M2 20l5-6.5 5 6.5 5-6.5 5 6.5M7 13.5V8.5M7 10.6c-2 0-3.2-1.1-3.6-2.6 1.9 0 3.2.9 3.6 2.6zM7 9.6c1.6 0 2.7-1 3.1-2.4-1.6 0-2.7.8-3.1 2.4z"/>',
    'scout': f'<circle {S} cx="10" cy="10" r="6"/><path {S} d="M14.6 14.6l5.9 5.9M7.4 12.6c0-3 1.9-5 5-5 0 3-1.9 5-5 5z"/>',
    'spray': f'<path {S} d="M2.8 21.2l8.6-8.6M11.4 12.6l1.4-3 3 3-3 1.4zM9 15l-2.2-2.2"/><circle {F} cx="17.6" cy="6.4" r="1.3"/><circle {F} cx="20.6" cy="3.4" r="1.1"/><circle {F} cx="19.4" cy="10.2" r="1.3"/><circle {F} cx="22" cy="9.2" r="1"/><circle {F} cx="13.8" cy="4.6" r="1.3"/><circle {F} cx="14.8" cy="1.8" r="1"/><circle {F} cx="17.2" cy="13.8" r="1"/>',
    'water': f'<path {S} d="M12 3.2c3.2 4.9 6 8.1 6 11.6a6 6 0 0 1-12 0c0-3.5 2.8-6.7 6-11.6z"/><path {S} d="M9.3 15.2a2.8 2.8 0 0 0 2.7 2.6"/>',
    'rogue': f'<path {S} d="M13 21V11M13 13.4c-2.9 0-4.8-1.8-5.2-4.4 2.9 0 4.8 1.8 5.2 4.4zM13 12c2.9 0 4.8-1.8 5.2-4.4-2.9 0-4.8 1.8-5.2 4.4zM13 21l-2.4 1.6M13 21l2.4 1.6M4.5 5.2L6.5 3l2 2.2M6.5 3.2V11"/><circle {F} cx="10" cy="10" r="1.3"/>',
    'sample': f'<path {S} d="M3 11h18M12 2.5v6.2M9.6 4.6h4.8"/><ellipse {S} cx="8" cy="16.5" rx="2.8" ry="2.1"/><ellipse {S} cx="14.4" cy="17.4" rx="2.2" ry="1.7"/><ellipse {F} cx="18.6" cy="14.6" rx="1.5" ry="1.2"/>',
    'kill': f'<path {S} d="M10 21v-9.5c0-3-2.6-5-5.5-5.2M4.5 6.3c-1 2-.6 4 1.4 5.2M10 13.2c2-1.2 4.6-1 6 .8M18 15v6M15.8 19l2.2 2.2 2.2-2.2"/>',
    'dig': f'<path {S} d="M2 13.5h20M12 2.5v7.5M9 7v3.3h6V7"/><ellipse {F} cx="6" cy="17.6" rx="3" ry="2"/><ellipse {F} cx="12.6" cy="18.8" rx="2.5" ry="1.7"/><ellipse {F} cx="18.2" cy="17.2" rx="2.3" ry="1.6"/>',
    # land and building
    'fell': f'<path {S} d="M5 14h14v6.5H5zM15.5 4l-3.2 10M13.2 2.6l5.6 1.6-1 3.2-5.4-1.6z"/><ellipse {S} cx="12" cy="14" rx="7" ry="1.7"/>',
    'rocks': f'<path {S} d="M2 19.5h20M3.5 19.5c0-3.2 2-5.2 4.6-5.2s4.4 2 4.4 5.2M11 19.5c0-4 2.6-6.6 5.4-6.6s5 2.6 5 6.6M7.2 14.4c0-2.4 1.6-4 3.6-4s3.2 1.4 3.4 3.3"/>',
    'brush': f'<path {S} d="M6 21V9M6 13.5L3 10.5M6 11.5l3-3M12 21V5.5M12 10L9 7M12 12.5l3-3M15.5 21l4.6-10.4c.9-2.1-.8-4-2.9-3.1"/>',
    'build': f'<path {S} d="M3.5 20.5V10.2L12 3.6l8.5 6.6v10.3M2 20.5h20M3.5 20.5L20.5 10.2M12 3.6v16.9"/>',
    'haul': f'<path {S} d="M2.5 15h12V8.5h-12zM14.5 11h3.6l2.6 3v1h-6.2M5.5 8.5l2-3h3l2 3"/><circle {S} cx="6.5" cy="18" r="2"/><circle {S} cx="17.5" cy="18" r="2"/>',
    # the five kinds of work
    'machine': f'<circle {S} cx="7.5" cy="15.5" r="4.6"/><circle {S} cx="18.2" cy="17.6" r="2.4"/><path {S} d="M7.5 10.9V5.5h5.2l2 6h4.8v3.6M12.2 15.5h3.6M10 5.5V3"/><circle {F} cx="7.5" cy="15.5" r="1.3"/>',
    'field': f'<path {S} d="M4.5 21L16.5 6M14.2 3.2l6.6 5.4-2 2.4-6.6-5.4z"/>',
    'woods': f'<path {S} d="M12 2.8l5 6h-2.6l4 5.6h-3l3.2 5.2H5.4l3.2-5.2h-3l4-5.6H7z"/><path {S} d="M12 19.6v2.6"/>',
    'hammer': f'<path {S} d="M12.6 3.2l7.6 7.6-2.6 2.6-7.6-7.6zM13.8 9.6l-9.6 9.8 2 2 9.8-9.6"/>',
    'pack': f'<path {S} d="M7 8c0-2.4 2.2-4 5-4s5 1.6 5 4l1.8 12.5H5.2z"/><path {S} d="M8.4 8.4h7.2M9.5 13.5h5"/>',
    # the farm
    'people': f'<circle {S} cx="9" cy="8" r="3.2"/><path {S} d="M2.8 20.5c0-4 2.6-6.4 6.2-6.4s6.2 2.4 6.2 6.4"/><circle {S} cx="16.8" cy="9" r="2.6"/><path {S} d="M15.6 14.2c3.2.2 5.6 2.4 5.6 6.3"/>',
    'hire': f'<circle {S} cx="9" cy="8" r="3.2"/><path {S} d="M2.8 20.5c0-4 2.6-6.4 6.2-6.4s6.2 2.4 6.2 6.4M18.5 6v7M15 9.5h7"/>',
    'grid': f'<path {S} d="M3 4h18v16H3zM3 9.5h18M3 15h18M9 4v16M15 4v16"/>',
    'yard': f'<path {S} d="M3.5 20.5v-9.2l3-5h11l3 5v9.2zM2 20.5h20M10 20.5v-5.4h4v5.4M6.5 11.3h11"/>',
    'land': f'<path {S} d="M2.5 19l4-9.5h15l-4 9.5zM8 9.5V2.8l5.4 2.2L8 7.2"/>',
    'contract': f'<path {S} d="M5.5 2.8h9.2l3.8 3.8v14.6h-13zM14.7 2.8v3.8h3.8M8.5 10.5h7M8.5 13.5h7M8.5 17.6c1-1 2 1 3 0s2 1 3 0"/>',
    'money': f'<path {S} d="M2.5 6.5h19v11h-19zM5.5 9.5v5M18.5 9.5v5"/><circle {S} cx="12" cy="12" r="2.8"/>',
    'ticket': f'<path {S} d="M3.5 5.5h17v4a2.5 2.5 0 0 0 0 5v4h-17v-4a2.5 2.5 0 0 0 0-5z"/><path {S} stroke-dasharray="1.4 1.8" d="M9 6.5v11"/>',
    'deliver': f'<path {S} d="M2 6.5h12.5V16H2zM14.5 9.5h4l3 3.5v3h-7"/><circle {S} cx="6" cy="18" r="2"/><circle {S} cx="17.5" cy="18" r="2"/>',
    'sell': f'<path {S} d="M3 12.5L11.5 4h8.5v8.5L11.5 21z"/><circle {F} cx="16" cy="8" r="1.6"/>',
    'store': f'<path {S} d="M2 20.5V11l10-6.5L22 11v9.5M2 20.5h20M6 20.5v-7h12v7M6 16.5h12"/>',
    # weather (the almanac's cuts)
    'sun': f'<circle {S} cx="12" cy="12" r="4"/><path {S} d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    'cloud': f'<path {S} d="M6.5 18.5h11a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.8 1.2 3.2 3.2 0 0 0-.6 6.4z"/>',
    'rain': f'<path {S} d="M6.5 14.5h11a3.6 3.6 0 0 0 .4-7.2 5.4 5.4 0 0 0-10.4 1.2 3 3 0 0 0-1 6z"/><path {S} d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3"/>',
    'shower': f'<path {S} d="M8.5 4.2V2.5M3.6 8.5H2M5 5l-1.1-1.1"/><path {S} d="M5.6 9.6a3.4 3.4 0 0 1 5.6-3"/><path {S} d="M8.5 16h10a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.6 1.2 2.8 2.8 0 0 0-.7 5.6z"/><path {S} d="M11 19l-.8 2.6M15.5 19l-.8 2.6"/>',
    'snow': f'<path {S} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M10 4.6l2 1.6 2-1.6M10 19.4l2-1.6 2 1.6"/>',
    'frost': f'<path {S} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><circle {F} cx="12" cy="12" r="1.6"/>',
    # field states
    'blight': f'<path {S} d="M4.5 19.5C4.5 10.5 9.5 4.5 19.5 4.5c0 9.5-5.5 15-15 15zM4.5 19.5l6-6"/><circle {F} cx="13" cy="11" r="2.6"/>',
    'dry': f'<path {S} d="M2.5 19.5h19M7.5 19.5l1.8-2.6-1.6-2.2M15.5 19.5l-1-2 1.8-2.2"/><circle {S} cx="12" cy="7" r="2.8"/><path {S} d="M12 1.8v.8M17.2 7h-.8M6.8 7h.8"/>',
    'leaf': f'<path {S} d="M5 19C5 10.5 10 5 19 5c0 8.6-5 14-14 14zM5 19l8-8"/>',
    'bloom': f'<circle {S} cx="12" cy="6.6" r="2.8"/><circle {S} cx="6.6" cy="10.6" r="2.8"/><circle {S} cx="17.4" cy="10.6" r="2.8"/><circle {S} cx="8.6" cy="16.8" r="2.8"/><circle {S} cx="15.4" cy="16.8" r="2.8"/><circle {F} cx="12" cy="12" r="1.8"/>',
    'down': f'<path {S} d="M12 21V9c0-2.6-2-4.6-5-5M12 12.5c2.6-1.6 5.6-1.2 7 1M5.2 8.5c.4 1.8 1.8 3 3.6 3"/>',
    'rest': f'<path {S} d="M12 21V4M12 7.5l-3-2.5M12 7.5l3-2.5M12 11.5l-3.2-2.6M12 11.5l3.2-2.6M12 15.5l-3.4-2.6M12 15.5l3.4-2.6"/>',
    'planted': f'<path {S} d="M3 11.5h18"/><ellipse {F} cx="12" cy="16.5" rx="3.6" ry="2.4"/><path {S} d="M12 13.5V8.5"/>',
    # the clock and the frame
    'pause': f'<path fill="currentColor" d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>',
    'play': f'<path fill="currentColor" d="M7 4.2l12.5 7.8L7 19.8z"/>',
    'skip': f'<path fill="currentColor" d="M4.5 4.2l10 7.8-10 7.8zM16 4.5h3.4v15H16z"/>',
    'menu': f'<path {S} d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
    'alert': f'<path {S} d="M6 16.8V11a6 6 0 0 1 12 0v5.8l2 2.2H4zM10 21.2h4"/>',
    'check': f'<path {S} stroke-width="2" d="M4.2 12.6l5 5L20 6.8"/>',
    'close': f'<path {S} d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    'more': f'<circle {F} cx="5.5" cy="12" r="1.9"/><circle {F} cx="12" cy="12" r="1.9"/><circle {F} cx="18.5" cy="12" r="1.9"/>',
    'arrow': f'<path {S} d="M3.5 12h16M14 6.5l5.5 5.5-5.5 5.5"/>',
    'foreman': f'<circle {S} cx="12" cy="8.5" r="3.4"/><path {S} d="M5.5 20.5c0-4 2.8-6.6 6.5-6.6s6.5 2.6 6.5 6.6M7.5 5.8h9M9 5.8l1-3h4l1 3"/>',
    'raise': f'<path {S} d="M3 18.5l6-6 4 4 7.5-8.5M15.5 8h5v5"/>',
    'letgo': f'<path {S} d="M14.5 4.5h5v15h-5M10.5 16.5L15 12l-4.5-4.5M15 12H3.5"/>',
    'sound': f'<path {S} d="M3.5 9.5h3.6l4.9-4v13l-4.9-4H3.5zM15.5 9c1.4 1.6 1.4 4.4 0 6M18.2 6.4c2.8 3.2 2.8 8 0 11.2"/>',
    'save': f'<path {S} d="M4 3.5h13l3 3v14H4zM7.5 3.5v5.5h8V3.5M7 20.5v-7h10v7"/>',
    # the printer's fist: what the farm would do next
    'fist': f'<path {S} stroke-width="1.5" d="M2.5 8.2h3.6v8.6H2.5zM6.1 9.2c1.5-1.8 3.3-2.7 5.4-2.7h1.2M9.4 9.2h10.8a1.35 1.35 0 0 1 0 2.7h-7.4M12.8 11.9h1.8a1.25 1.25 0 0 1 0 2.5h-2M12.6 14.4h1.6a1.2 1.2 0 0 1 0 2.4H9.6c-1.4 0-2.6-.3-3.5-.9"/>',
    'hazard': f'<path {S} d="M12 3.2L21.5 20H2.5z"/><path {S} stroke-width="2" d="M12 9.5v5"/><circle {F} cx="12" cy="17.2" r="1.2"/>',
    'stump': f'<path {S} d="M6 20.5V12h12v8.5M3 20.5h18M6 12c0-1.4 2.7-2.5 6-2.5s6 1.1 6 2.5M9.5 11.4c.6-.5 1.5-.7 2.5-.7s1.9.2 2.5.7M6 16.5l-2.5 4M18 16.5l2.5 4"/>',
    'logs': f'<circle {S} cx="7" cy="16" r="3.4"/><circle {S} cx="15.5" cy="16" r="3.4"/><circle {S} cx="11.2" cy="9.4" r="3.4"/><circle {F} cx="7" cy="16" r="1"/><circle {F} cx="15.5" cy="16" r="1"/><circle {F} cx="11.2" cy="9.4" r="1"/>',
    'stone': f'<path {S} d="M3 19.5l2.5-6.5 5-2.5 5 1.5 3 4 2.5 3.5zM10.5 10.5l1 4 4-2.5"/>',
    'scale': f'<path {S} d="M4.5 20.5h15M12 20.5v-4M6 16.5h12"/><circle {S} cx="12" cy="9" r="6"/><path {S} d="M12 9l3-3"/>',
    'winter': f'<path {S} d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2M9.6 4.4L12 6.2l2.4-1.8M9.6 19.6l2.4-1.8 2.4 1.8M3.8 10.4l2.6.9.4 2.6M20.2 13.6l-2.6-.9-.4-2.6"/>',
    'key': f'<path {S} d="M3.5 6.5h17v11h-17zM6.5 10h1M10 10h1M13.5 10h1M17 10h.5M8 14h8"/>',
}

def sprite():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">']
    for k, v in I.items():
        out.append(f'<symbol id="i-{k}" viewBox="0 0 24 24" stroke-width="1.7">{v}</symbol>')
    out.append('</svg>')
    return '\n'.join(out)


def css():
    lines = ['/* The icon family: generated from one drawing list, each icon a mask printed in the ink of its element. */',
             '.i { display: inline-block; width: var(--i, 20px); height: var(--i, 20px); flex: none; background: currentColor;',
             '  -webkit-mask: var(--m) center / contain no-repeat; mask: var(--m) center / contain no-repeat; vertical-align: middle; }']
    for k, v in I.items():
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.7">{v}</svg>'
        lines.append(f'.i-{k} {{ --m: url("data:image/svg+xml,{urllib.parse.quote(svg, safe=" =:/,.-")}"); }}')
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    d = sys.argv[1]
    open(f'{d}/icons.svg', 'w').write(sprite() + '\n')
    print(len(I), 'icons')

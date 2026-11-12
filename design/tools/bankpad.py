"""One-off: folds the separate pass book, clock and menu tab of the season-screen frames into the bank's mount."""
import re, sys

pat = re.compile(r'<section class="passbook paper bank" aria-label="Cash"><div class="head"><span class="cap">Pass book</span></div>'
                 r'<span class="datestamp" aria-hidden="true">(\w+)<b>(\d+)</b></span><div class="bal( red)? num">([^<]+)</div></section>\n'
                 r'\s*(<div class="clock[^\n]*</div>)\n\s*<button class="menu-tab paper manila" aria-label="Menu"><i class="i i-menu"></i></button>')
for f in sys.argv[1:]:
    t = open(f).read()
    def sub(m):
        mon, day, red, amt, clock = m.groups()
        return (f'<section class="bank-pad" aria-label="Cash and clock">\n'
                f'    <div class="imprint" aria-hidden="true"><span class="orn"></span></div>\n'
                f'    <div class="passbook paper bank"><span class="datestamp" aria-hidden="true">{mon}<b>{day}</b></span><div class="bal{red or ""} num">{amt}</div></div>\n'
                f'    <div class="keys-row">{clock}<button class="menu-key paper manila" aria-label="Menu"><i class="i i-menu"></i></button></div>\n'
                f'  </section>')
    t, n = pat.subn(sub, t)
    t = t.replace('<div class="imprint"><span>Grange Supply</span></div>', '<div class="imprint" aria-hidden="true"><span class="orn"></span></div>')
    open(f, 'w').write(t)
    print(f, n)

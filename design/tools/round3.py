"""One-off edits for round 3: the goal slip, the people's pins and the pencil code in the season frames."""
import re

GOAL = '''<section class="goal" aria-label="Goal">
    <s class="was struck">Plant a field</s>
    <p class="now"><i class="i i-fist" aria-hidden="true"></i><b>Spray before the blight</b>
      <span class="tally" aria-label="2 of 8 goals"><i class="tick on"></i><i class="tick on"></i><i class="tick"></i></span></p>
  </section>'''
PIN = '<span class="pin{cls}" style="left:{x}px;top:{y}px;--c:{c}{fg}" aria-label="{who}"><i class="foot"></i><i class="staff"></i><span class="flag" data-i="{i}"></span>{mark}</span>\n'
def pin(x, y, c, i, who, cls='', fg='', mark=''):
    return '  ' + PIN.format(x=x, y=y, c=c, i=i, who=who, cls=cls, fg=f';--fg:{fg}' if fg else '', mark=mark)
BANG = '<span class="mark">!</span>'
PINS = {
    'season-card': pin(655, 412, '#b8402e', 'Y', 'You') + pin(252, 296, '#2f6f9f', 'N', 'Normand') +
        pin(1082, 452, '#d9a441', 'A', 'Alcide', fg='#1e1c19') + pin(660, 352, '#6b4c8a', 'V', 'Verna: worn out', ' needs', mark=BANG),
    'people': pin(655, 412, '#b8402e', 'Y', 'You') + pin(1010, 300, '#2f6f9f', 'N', 'Normand, picked', ' picked') +
        pin(1082, 452, '#d9a441', 'A', 'Alcide', fg='#1e1c19'),
    'incident': pin(690, 600, '#b8402e', 'Y', 'You: the tractor has broken down', ' needs', mark=BANG),
}
for name, pins in PINS.items():
    p = f'src/{name}.html'
    t = open(p).read()
    t = re.sub(r'<p class="goal paper">.*?</p>', GOAL, t, flags=re.S)
    t = t.replace('<span class="unit-ring" style="left:653px;top:414px"></span>\n', '')
    t = t.replace('  <div class="yard-mark"', pins + '  <div class="yard-mark"', 1)
    t = t.replace('<span class="num quiet">/ 1,500 cwt</span>', '<span class="num quiet of">1,500 cwt</span>')
    t = t.replace('<div class="spine"><span>Time book</span></div>', '<div class="spine"></div>')
    open(p, 'w').write(t)

p = 'src/season-card.html'
t = open(p).read()
t = t.replace('<span class="queued"><i class="i i-spray"></i>On the list</span>', '<span class="queued"><i class="tick on"></i><i class="i i-spray"></i>on the list</span>')
t = t.replace('<p><i class="i i-bloom"></i>Yield <span class="range"><i style="left:44%;width:16%"></i></span><b class="num">260–340</b> <span class="quiet">cwt/acre, by eye</span></p>',
              '<p><i class="i i-bloom"></i>Yield <b class="num">260–340</b> cwt/acre <span class="range"><i style="left:44%;width:16%"></i></span><span class="quiet it">by eye</span></p>')
t = t.replace('<span class="stamp ink sm onlist">On the list</span>', '<span class="onlist"><i class="tick on"></i>on the list</span>')
open(p, 'w').write(t)

p = 'papers.css'
t = open(p).read()
t = t.replace('.clock { display: grid; grid-template-columns: repeat(4, 1fr); grid-column: 1 / 5; padding: 0; }',
              '.clock { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); grid-column: 1 / 5; padding: 0; }')
open(p, 'w').write(t)
print('done')

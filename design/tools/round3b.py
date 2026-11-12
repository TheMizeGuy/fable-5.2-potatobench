"""One-off edits for round 3: spring fits its five folds; the phone frames take the new goal slip and pins."""
import re

p = 'src/spring.html'
t = open(p).read()
t = t.replace('<span class="quiet it">3 asking for work, 1 hired</span><span class="dots"></span><span class="num">$450/mo</span></div>\n        <p class="fold-note it">Paid by the month from the start of the season.</p>',
              '<span class="quiet it">3 asking, 1 hired</span><span class="dots"></span><span class="num">$450/mo</span></div>')
t = t.replace('''        <p class="lead"><span>This plan</span><span class="dots"></span><b class="num big">$39,750</b></p>
        <p class="lead quiet"><span class="it">with wages</span><span class="dots"></span><span class="num">$450</span></p>
        <p class="lead quiet"><span class="it">on the spring loan</span><span class="dots"></span><span class="num">$21,750</span></p>
        <p class="lead"><span class="it">due at year end</span><span class="dots"></span><span class="num red">$21,000</span></p>''',
              '''        <p class="lead"><span>This plan, with wages</span><span class="dots"></span><b class="num big">$39,750</b></p>
        <p class="lead"><span class="it">$21,750 on the spring loan, due at year end</span><span class="dots"></span><span class="num red">$21,000</span></p>''')
t = t.replace('<section class="passbook paper bank left" aria-label="Cash"><div class="head"><span class="cap">Pass book</span></div>',
              '<section class="passbook paper bank left" aria-label="Cash"><div class="head">balance</div>')
open(p, 'w').write(t)

p = 'src/spring.phone.html'
t = open(p).read()
t = t.replace('<section class="passbook paper bank left" aria-label="Cash"><div class="head"><span class="cap">Pass book</span></div>',
              '<section class="passbook paper bank left" aria-label="Cash"><div class="head">balance</div>')
open(p, 'w').write(t)

p = 'src/season.phone.html'
t = open(p).read()
t = re.sub(r'<p class="goal paper">.*?</p>', '''<section class="goal" aria-label="Goal">
    <p class="now"><i class="i i-fist" aria-hidden="true"></i><b>Spray before the blight</b>
      <span class="tally" aria-label="2 of 8 goals"><i class="tick on"></i><i class="tick on"></i><i class="tick"></i></span></p>
  </section>''', t, flags=re.S)
t = t.replace('<section class="passbook paper bank" aria-label="Cash"><div class="head"><span class="cap">Pass book</span></div>',
              '<section class="passbook paper bank" aria-label="Cash"><div class="head">balance</div>')
t = t.replace('<span class="unit-ring" style="left:240px;top:383px"></span>\n',
              '<span class="pin" style="left:242px;top:384px;--c:#b8402e" aria-label="You"><i class="foot"></i><i class="staff"></i><span class="flag" data-i="Y"></span></span>\n'
              '  <span class="pin needs" style="left:330px;top:330px;--c:#6b4c8a" aria-label="Verna: worn out"><i class="foot"></i><i class="staff"></i><span class="flag" data-i="V"></span><span class="mark">!</span></span>\n')
t = t.replace('<i class="flag"></i>', '<span class="mark">!</span>')
open(p, 'w').write(t)
print('done')

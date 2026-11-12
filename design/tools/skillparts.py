"""Writes the two ways an applicant's skills are shown: all five in a ruled row (desk), the best one only (phone)."""
import os, sys

out = sys.argv[1]
names = [('a', 'Machine'), ('b', 'Field'), ('c', 'Woods'), ('d', 'Build'), ('e', 'Pack')]
# the best is marked by a class filled per letter: {{best}} names the letter; each cell asks whether it is the one
cells = ''.join(f'<li class="b-{k}-{{{{best}}}}"><span>{n}</span><b>{{{{{k}}}}}</b></li>' for k, n in names)
open(os.path.join(out, 'skills-row.html'), 'w').write(f'<ul class="skill-row" aria-label="Skills, out of ten">{cells}</ul>')
open(os.path.join(out, 'skills-one.html'), 'w').write(
    '<p class="skill-one" aria-label="Best at {{bn}}, {{bl}} of ten"><b>{{bn}} {{bl}}</b><span class="tens best" style="--lv:{{bl}}"></span></p>')
print('ok')

"""Counts the words a frame shows, the way tools/quality/capture.ts does: every whitespace-separated token of visible
text. Usage: words.py <frame.html>..."""
import sys
from html.parser import HTMLParser


class Count(HTMLParser):
    def __init__(self):
        super().__init__()
        self.n = 0
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('style', 'script', 'title', 'svg') or 'sr' in (a.get('class') or '').split():
            self.skip += 1

    def handle_endtag(self, tag):
        if self.skip and tag in ('style', 'script', 'title', 'svg', 'span', 'p', 'div'):
            pass
        if tag in ('style', 'script', 'title', 'svg') and self.skip:
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip:
            self.n += len(d.split())


for f in sys.argv[1:]:
    c = Count()
    c.feed(open(f).read())
    print(f, c.n)

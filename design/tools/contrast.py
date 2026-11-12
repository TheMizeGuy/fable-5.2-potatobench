def lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


stocks = {'ledger': '#f2ead6', 'almanac': '#ebe3cd', 'manila': '#d8c08e', 'buff': '#e7d7a8', 'bank': '#dde4d3', 'calendar': '#f6f1e4'}
inks = {'ink': '#1e1c19', 'ink2': '#4b463d', 'red': '#9c3226', 'blue': '#2f507a', 'violet': '#553d79', 'green': '#2b5637', 'ochre': '#7c4f0e', 'pencil': '#55575b'}
print('%-8s' % '', ' '.join('%7s' % k for k in stocks))
for k, v in inks.items():
    print('%-8s' % k, ' '.join('%7.2f' % ratio(v, s) for s in stocks.values()))
# edges and paper against the hard backdrops
backs = {'snow': '#e2e5e8', 'snowsky': '#eef0f2', 'night': '#3a4a6a', 'july-green': '#4f7a34', 'sky': '#cfe0ea'}
edge = '#4a3f2e'
for b, c in backs.items():
    print(b, 'paper %.2f' % ratio(stocks['ledger'], c), 'keyline %.2f' % ratio(edge, c), 'ink-mount %.2f' % ratio('#2a241c', c))
print('paper text on ink', ratio('#f2ead6', '#1e1c19'))

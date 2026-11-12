import math, os, random, struct, sys, zlib

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def png(path, w, h, rows, mode):
    # mode 4: grey+alpha, 6: RGBA
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, mode, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
    print(path, len(data))


def value_noise(w, h, cell, rnd):
    gw, gh = w // cell, h // cell
    g = [[rnd.random() for _ in range(gw)] for _ in range(gh)]
    def at(x, y):
        fx, fy = x / cell, y / cell
        x0, y0 = int(fx) % gw, int(fy) % gh
        x1, y1 = (x0 + 1) % gw, (y0 + 1) % gh
        tx, ty = fx - int(fx), fy - int(fy)
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = g[y0][x0] * (1 - tx) + g[y0][x1] * tx
        b = g[y1][x0] * (1 - tx) + g[y1][x1] * tx
        return a * (1 - ty) + b * ty
    return at


# Paper: a tileable grain of fine specks over a soft cloud of formation (how the fibres lie), drawn as dark grey
# with low alpha so it multiplies onto any stock colour.
rnd = random.Random(7)
W = 256
n1 = value_noise(W, W, 64, rnd)
n2 = value_noise(W, W, 4, rnd)
n3 = value_noise(W, W, 2, rnd)
rows = []
for y in range(W):
    r = []
    for x in range(W):
        # a warm, very slow unevenness, then the tooth: fine grain two and four pixels across
        a = 6 + n1(x, y) * 7 + n2(x, y) * 6 + n3(x, y) * 7 + rnd.random() * 3
        if rnd.random() > 0.9985:
            a += 22
        r += [70, min(255, int(a))]
    rows.append(r)
# fibre: very short, faint, all lying roughly one way, as paper fibre lies along the machine direction
for _ in range(260):
    x, y = rnd.random() * W, rnd.random() * W
    ang = (rnd.random() - 0.5) * 0.9
    ln = 2 + rnd.random() * 4
    for t in range(int(ln * 2)):
        px = int(x + math.cos(ang) * t / 2) % W
        py = int(y + math.sin(ang) * t / 2) % W
        i = px * 2 + 1
        rows[py][i] = min(255, rows[py][i] + 5)
png(os.path.join(out, 'grain.png'), W, W, rows, 4)

# Ink: where a rubber stamp or a worn block failed to print. White is ink, clear is bare paper: used as a mask.
rnd = random.Random(11)
W = 192
m1 = value_noise(W, W, 24, rnd)
m2 = value_noise(W, W, 6, rnd)
rows = []
for y in range(W):
    r = []
    for x in range(W):
        v = m1(x, y) * 0.6 + m2(x, y) * 0.4
        a = 255
        if v < 0.25:
            a = int(max(0, (v - 0.15) / 0.10) * 255)
        if rnd.random() > 0.99:
            a = 60
        r += [255, a]
    rows.append(r)
png(os.path.join(out, 'ink.png'), W, W, rows, 4)

# Fine ink: a large block of wood type, which prints nearly solid with only a little starving at the edges of the grain.
rnd = random.Random(23)
f1 = value_noise(W, W, 48, rnd)
f2 = value_noise(W, W, 4, rnd)
rows = []
for y in range(W):
    r = []
    for x in range(W):
        v = f1(x, y) * 0.55 + f2(x, y) * 0.45
        a = 255 if v > 0.2 else int(150 + (v / 0.2) * 105)
        if rnd.random() > 0.996:
            a = 90
        r += [255, a]
    rows.append(r)
png(os.path.join(out, 'inkfine.png'), W, W, rows, 4)

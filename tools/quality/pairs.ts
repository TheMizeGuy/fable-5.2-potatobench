// Builds the blind comparison: for each frame present in both sets, an unlabelled pair in random order.
// The key that says which side is which is written somewhere the judges are not pointed at.
// Usage: node tools/quality/pairs.ts <before dir> <after dir> <pairs dir> <key file> [salt]
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [before, after, out, keyFile, salt = 'county'] = process.argv.slice(2)
if (!before || !after || !out || !keyFile) throw new Error('usage: pairs.ts <before dir> <after dir> <pairs dir> <key file> [salt]')

interface Frame { file: string; state: string; size: string; what: string }
const frames = JSON.parse(readFileSync(join(after, 'index.json'), 'utf8')) as Frame[]
mkdirSync(out, { recursive: true })

const pairs: { id: string; state: string; size: string; what: string }[] = []
const key: Record<string, { A: 'before' | 'after'; B: 'before' | 'after' }> = {}
for (const f of frames) {
  if (!existsSync(join(before, f.file))) continue
  const h = createHash('sha256').update(`${salt}:${f.file}`).digest()
  const id = h.toString('hex').slice(0, 8)
  const afterIsA = (h[8] & 1) === 1
  const dir = join(out, id)
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(afterIsA ? after : before, f.file), join(dir, 'A.png'))
  copyFileSync(join(afterIsA ? before : after, f.file), join(dir, 'B.png'))
  pairs.push({ id, state: f.state, size: f.size, what: f.what })
  key[id] = afterIsA ? { A: 'after', B: 'before' } : { A: 'before', B: 'after' }
}
pairs.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(join(out, 'index.json'), JSON.stringify(pairs, null, 1) + '\n')
writeFileSync(keyFile, JSON.stringify(key, null, 1) + '\n')
console.log(`${pairs.length} pairs in ${out}; key in ${keyFile}`)

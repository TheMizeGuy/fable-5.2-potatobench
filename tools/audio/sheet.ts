// Puts a render's tables into docs/quality/sound.md, between the marks left there for them, and copies in the
// small pictures the write-up shows. Runs in a second, with no browser.
// Usage: node tools/audio/sheet.ts <folder written by tools/audio/render.ts>
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const from = process.argv[2]
if (!from) {
  console.error('usage: node tools/audio/sheet.ts <render folder>')
  process.exit(2)
}
const folder = resolve(from)
const doc = join(root, 'docs/quality/sound.md')
let text = readFileSync(doc, 'utf8')

// Each section of the write-up that a render makes, and the file it comes from.
const PARTS: [string, string][] = [['table', 'table.md'], ['cues', 'cues.md'], ['compared', 'compared.md'], ['instruments', 'instruments.txt']]
for (const [mark, file] of PARTS) {
  const a = `<!-- ${mark}:start -->`, b = `<!-- ${mark}:end -->`
  const i = text.indexOf(a), j = text.indexOf(b)
  if (i < 0 || j < i) { console.error(`no ${a} ... ${b} in ${doc}`); process.exitCode = 1; continue }
  const path = join(folder, file)
  if (!existsSync(path)) { console.error(`no ${file} in ${folder} (a full run of tools/audio/render.ts writes it)`); process.exitCode = 1; continue }
  let body = readFileSync(path, 'utf8').trim()
  if (file.endsWith('.txt')) body = `\`\`\`\n${body}\n\`\`\``
  text = `${text.slice(0, i + a.length)}\n${body}\n${text.slice(j)}`
  console.log(`${mark}: ${body.split('\n').length} lines from ${file}`)
}
writeFileSync(doc, text)

let copied = 0
for (const m of text.matchAll(/\]\(sound\/([a-z0-9-]+)\.png\)/g)) {
  const src = join(folder, 'small', `${m[1]}.png`)
  if (!existsSync(src)) { console.error(`no picture for ${m[1]} in ${folder}/small`); process.exitCode = 1; continue }
  copyFileSync(src, join(root, 'docs/quality/sound', `${m[1]}.png`))
  copied++
}
console.log(`${copied} pictures copied to docs/quality/sound`)

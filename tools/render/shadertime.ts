// What in a shader is dear to compile: the dearest materials compiled alone, as they are and with one piece or
// another of the fragment shader cut out (the renderer's timeShader hook), each twice, the quicker kept. A cut that
// leaves the shader broken says so.
// Usage: node tools/render/shadertime.ts <base-url>
import { chromium } from '@playwright/test'
import { GPU } from '../quality/shared.ts'

const base = process.argv[2] ?? 'http://localhost:5317/'
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (globalThis as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })

type Cut = [string, string]
const time = async (label: string, cuts: Cut[]) => {
  let best = { ms: 1e9, page: 0, ok: false, missed: [] as string[] }
  for (let k = 0; k < 2; k++) {
    const r = await page.evaluate(([label, cuts]) => (globalThis as any).__countyField.timeShader(label, cuts, true), [label, cuts] as const)
    if (r.ms < best.ms) best = r
  }
  return best
}
const SHADOW: Cut = ['if \\(fade <= 0\\.0\\) return 1\\.0;', 'return 1.0;']
const COLOUR: Cut = ['(#include <color_fragment>)[\\s\\S]*?(#include <)', '$1\n$2']
const LAND: [string, Cut[]][] = [
  ['the quilt of the neighbours\' strips', [['Land l = landAt\\(pw\\);[\\s\\S]*?col = mix\\(outland, col, ours\\);', '']]],
  ['grass close to', [['float lie1 = textureGrad[\\s\\S]*?2\\.5 \\* nearK \\* meadowN;', '']]],
  ['pasture', [['float piece = texture2D[\\s\\S]*?trail \\* 0\\.55 \\* meadow\\);', '']]],
  ['wildflowers', [['vec2 fp = p \\* 2\\.6;[\\s\\S]*?share \\* 0\\.1, far\\)\\);', '']]],
  ['the village and the siding', [['vec2 pd = pw - PLACES\\[k\\];[\\s\\S]*?apron \\* 0\\.9\\);', '']]],
  ['the parcels', [['if \\(fd <= 4\\.6\\) \\{[\\s\\S]*?\\(fine - 0\\.5\\) \\* 0\\.5\\)\\);\\s*\\}', '']]],
  ['snow', [['float holdS = [\\s\\S]*?landSnow = snowK;', 'float snowK = 0.0;']]],
]
const say = (label: string, r: { ms: number; page: number; ok: boolean; missed: string[] }, whole?: number) =>
  console.log(`  ${label.padEnd(46)} ${String(r.ms).padStart(6)} ms (the page's own part ${r.page})${whole !== undefined ? `  (${r.ms - whole >= 0 ? '+' : ''}${r.ms - whole})` : ''}${r.ok ? '' : '  DID NOT COMPILE'}${r.missed.length ? `  (nothing matched: ${r.missed.join(' ; ').slice(0, 80)})` : ''}`)

const HAZE: Cut = ['float ha = hazeAmount\\([\\s\\S]*?hm \\), ha \\);', '']
const SKY: Cut = ['iblIrradiance \\+= skyIrradiance\\( wN \\) \\* COUNTY_AMBIENT;', '']
const CLOUD: Cut = ['float cloudVis = cloudShade\\( vWorld \\)', 'float cloudVis = 1.0']
for (const [name, label] of [['a plain lit thing (stone walls)', 'terrain 5:'], ['the land', 'terrain (land) 0:'], ['a field\'s soil', 'fields '], ['the buildings', 'props ']] as const) {
  const whole = await time(label, [])
  console.log(`${name}: ${(whole as { name?: string }).name}`)
  say('as it is', whole)
  say('with no sun shadow read', await time(label, [SHADOW]), whole.ms)
  say('with no haze', await time(label, [HAZE]), whole.ms)
  say('with no light from the sky', await time(label, [SKY]), whole.ms)
  say('with no cloud shadow', await time(label, [CLOUD]), whole.ms)
  say('with none of its own colouring', await time(label, [COLOUR]), whole.ms)
  say('with none of all those', await time(label, [SHADOW, HAZE, SKY, CLOUD, COLOUR]), whole.ms)
  if (name !== 'the land') continue
  for (const [what, cuts] of LAND) say(`without ${what}`, await time(label, cuts), whole.ms)
  say('without any of those', await time(label, LAND.flatMap(l => l[1])), whole.ms)
}
console.log(errors.length ? `  page errors: ${errors.join(' | ')}` : '  no page errors')
await browser.close()

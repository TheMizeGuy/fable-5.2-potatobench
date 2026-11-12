// The icon family and the portraits: the design system's two sprites (design/icons.svg, design/portraits.svg), put
// into the page once by mountSprites() and drawn with <use>. One drawing list: design/tools/icons.py.
import iconSprite from '../../design/icons.svg?raw'
import portraitSprite from '../../design/portraits.svg?raw'
import { s } from './dom.ts'

// The game's older names for drawings the sprite holds under another.
const ALIAS: Record<string, string> = {
  clear: 'sun', overcast: 'cloud', cloud: 'partcloud', run: 'skip', tractor: 'machine', crew: 'people', go: 'arrow',
  warn: 'hazard', goal: 'fist', packing: 'pack', house: 'store', rise: 'raise', tree: 'woods', farmer: 'person',
}
export const ICON_NAMES: string[] = [...iconSprite.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1])
const KNOWN = new Set(ICON_NAMES)

export function iconId(name: string): string {
  const n = ALIAS[name] ?? name
  return KNOWN.has(n) ? n : 'help'
}

// An icon, printed in the ink (currentColor) of what holds it. cls: 'ic' 20 px, 'ic s' 16, 'ic l' 24.
export function icon(name: string, cls = 'ic'): SVGElement {
  return s('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, s('use', { href: `#i-${iconId(name)}` }))
}

// The sprites go into the page once, before anything draws with them. The portraits' colours are custom properties;
// they are moved from presentation attributes into style so every engine reads them.
export function mountSprites(doc: Document = document): void {
  if (doc.getElementById('sprites')) return
  const box = doc.createElement('div')
  box.id = 'sprites'
  box.setAttribute('aria-hidden', 'true')
  box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  box.innerHTML = iconSprite + portraitSprite.replace(/(fill|stroke)="var\((--[a-z]+)\)"/g, 'style="$1:var($2)"')
  doc.body.prepend(box)
}

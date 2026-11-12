// Farm words in plain words, in place: a word with a dotted rule under it says what it means under the pointer, or
// on a tap (it takes the focus).
import { h, type Child } from './dom.ts'

export const GLOSSARY: Record<string, string> = {
  cwt: 'A hundredweight: 100 pounds of potatoes. Crops, prices and stores are all counted in it.',
  'cwt/acre': 'Hundredweight an acre: how heavy the crop is for the ground it grows on.',
  'US No. 1': 'The top grade: sound, of a size, what the market pays full price for.',
  'US No. 2': 'The second grade: sound but misshapen or marked; paid less.',
  'B size': 'Small potatoes, under the No. 1 size; sold cheap.',
  culls: 'Potatoes not fit to sell: cut, green, rotten or too small.',
  hill: 'Pulling soil up over the row, so the tubers stay covered from light and blight and the weeds are buried. Twice a season.',
  hilled: 'How many times soil has been pulled up over the row: twice is the full job.',
  rogue: 'Pulling up and bagging the blighted plants that have been found, so they stop spreading spores.',
  'kill vines': 'Killing the tops on purpose: the tubers stop growing and their skins start to set, ready to dig.',
  'skins set': 'The tubers\' skins hardened after the vines die: they dig without bruising and keep in store.',
  protection: 'Protectant on the leaves. It stops blight spores taking hold; rain and new leaf wear it off. It cures nothing.',
  leaf: 'How much of the ground the leaves cover: the crop grows with its leaf.',
  water: 'Water in the soil the plants can use.',
  'crew-days': 'A day\'s work for one person. Two people do four crew-days in two days.',
  foreman: 'One of your people put in charge of a block of fields: each working morning they put on the list what its fields need, and do no field work. Paid 40% more.',
  tract: 'Woods, brush or rough ground the farm owns or can buy: felled, stumped and picked of rocks, it becomes a new field.',
  'rest year': 'A year in oats and clover: the field earns a little and its soil comes back.',
  bulking: 'The tubers are filling out: the weeks that make the crop.',
  'setting tubers': 'The plants are starting their tubers: how many set decides the crop.',
  'in bloom': 'The plants are in flower: the tubers are setting under them.',
  'blight watch': 'The weather has been right for late blight: walk the fields and keep the leaves protected.',
  sheltered: 'Woods beside the field keep the wind off: less water lost, but the leaves stay wet longer and blight likes that.',
  'the note': 'The farm\'s mortgage payment, taken by the bank at the year end.',
  'the household': 'What the family lives on for a year, taken at the year end.',
  'due at the year end': 'Taken at the year end whatever the crop: the note on the farm, the household\'s share, and the land mortgage if there is one.',
  'test dig': 'Lifting one hill to see the tubers: how many, how big, what is wrong. Your only look at the crop before dig day.',
  scout: 'Walking the rows for blight, which only shows up close.',
  'certified seed': 'Seed potatoes grown to be clean of virus: dearer than your own, and they grow more.',
  'fry plant': 'A buyer that makes fries: it wants big, sound potatoes and pays on a contract.',
  packer: 'A buyer that washes and bags potatoes for stores.',
  lapse: 'The day a question is decided for you if you have not answered it.',
}

// A word or phrase with its meaning in place. key: the glossary's entry, when it differs from the words shown.
export function term(text: string, key = text.toLowerCase()): Child {
  const tip = GLOSSARY[key] ?? GLOSSARY[text]
  if (!tip) return text
  return h('span', { class: 'term', tabindex: '0', 'data-tip': tip }, text, h('span', { class: 'sr' }, ` (${tip})`))
}

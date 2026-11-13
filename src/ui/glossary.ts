// Farm words in plain words, in place: a word with a dotted rule under it says what it means under the pointer, or
// on a tap (it takes the focus).
import { h, type Child } from './dom.ts'

const NOTE = 'The yearly bank payment on the farm\'s mortgage, which the bank collects at the end of the year.'
const LIVING = 'Your family\'s living costs for the year, which come out at the end of the year.'
const DUE = 'What you owe at the end of the year no matter how the crop does: the bank payment on the farm, your family\'s living costs, and the land mortgage if you have one.'

export const GLOSSARY: Record<string, string> = {
  cwt: 'Short for hundredweight, which is 100 pounds of potatoes. Crops, prices and storage are all measured in it.',
  'cwt/acre': 'Hundredweight per acre, which tells you how heavy the crop is for the amount of land.',
  'US No. 1': 'The top grade. These potatoes are sound and a good size, and the market pays full price for them.',
  'US No. 2': 'The second grade. These potatoes are sound but misshapen or marked, so they sell for less.',
  'B size': 'Small potatoes, under the No. 1 size, that sell cheap.',
  culls: 'Potatoes that can\'t be sold because they\'re cut, green, rotten or too small.',
  hill: 'Piling soil over the row so the potatoes stay covered from light and blight, and the weeds get buried. You do it twice a season.',
  hilled: 'How many times soil has been piled over the row. Twice is the full job.',
  rogue: 'Pulling up and bagging the blighted plants you\'ve found, so they stop spreading spores.',
  'kill vines': 'Killing the vines on purpose, so the potatoes stop growing and their skins toughen up for harvest.',
  'skins set': 'The potatoes\' skins have toughened since the vines died, so they can be dug without bruising and will keep in storage.',
  protection: 'Spray on the leaves that keeps blight from taking hold. Rain and new leaves wear it off, and it can\'t cure a plant that\'s already blighted.',
  leaf: 'How much of the ground the leaves cover. The more leaf a crop has, the faster it grows.',
  water: 'How much water the soil holds that the plants can use.',
  'crew-days': 'One person\'s work for one day. Two people get through four crew-days in two days.',
  foreman: 'One of your people who you put in charge of a block of fields. Each working morning they add what those fields need to the work list, and they don\'t do field work themselves. A foreman is paid 40% more.',
  tract: 'Woods, brush or rough ground that the farm owns or can buy. Once it\'s felled, cleared of stumps and picked clean of rocks, it becomes a new field.',
  'rest year': 'A year in oats and clover instead of potatoes. The field earns a little and its soil recovers.',
  bulking: 'The potatoes are filling out. These are the weeks that make the crop.',
  'setting tubers': 'The plants are starting to form potatoes, and how many they form decides the size of the crop.',
  'in bloom': 'The plants are flowering, which means potatoes are forming underneath.',
  'blight watch': 'The weather has been right for late blight, so scout the fields and keep the leaves sprayed.',
  sheltered: 'Woods beside the field block the wind. The field loses less water, but the leaves stay wet longer, which blight likes.',
  'the note': NOTE,
  'the bank payment': NOTE,
  'the household': LIVING,
  'the household\'s keep': LIVING,
  'your family\'s living costs': LIVING,
  'due at the year end': DUE,
  'due at the end of the year': DUE,
  'test dig': 'Digging up one plant to see how many potatoes it has, how big they are, and what\'s wrong with them. It\'s your only look at the crop before harvest.',
  scout: 'Walking the rows to look for blight, which you can only see up close.',
  'certified seed': 'Seed potatoes grown to be free of virus. They cost more than your own saved seed, but they yield more.',
  'fry plant': 'A buyer that makes fries. It wants big, sound potatoes and pays by contract.',
  packer: 'A buyer that washes and bags potatoes for stores.',
  lapse: 'The day a question gets decided for you if you haven\'t answered it.',
  'spring loan': 'If your spring plan costs more than the cash you have, the bank lends you the difference interest-free and takes it back at the end of the year out of what the crop earned.',
  block: 'A group of neighboring fields that are worked together: the home farm, the intervale across the brook, the ridge lots, or the Dufour place. A foreman looks after one block.',
  skill: 'How good someone is at a kind of work, from 0 to 10. A machine skill of 6 makes a good tractor driver. Skills improve with practice.',
  'contract only': 'This variety only pays well when you sell it on a contract. Without one it gets a low processing price.',
  'estimate before': 'What you expected the field to yield before this test dig, in hundredweight per acre. The range below it is what the test dig shows now.',
  'hold back seed': 'Keeping part of a lot in the cellar to plant next spring. It\'s free, but it carries any virus from the crop it came from.',
  'the cellar months': 'November to April, while your crop is in storage. You can sell it as prices move, and keep people on to fell trees, pack or build.',
  stamp: 'Press the round stamp next to a field\'s tag to give the order that field needs. Red means blight or a loss, so act now. Ochre is the next thing to do. Blue means the field is drying out. Black is work that\'s due.',
  'early dying': 'A wilt disease in the soil that kills plants early. It builds up when you plant potatoes after potatoes, and a rest year brings it back down.',
  lesions: 'The brown, spreading spots late blight makes on the leaves.',
  'hollow heart': 'A hollow spot in the middle of a big potato, caused by growing too fast after dry weather. It lowers the potato\'s grade.',
  large: 'Potatoes over the No. 1 size. Some buyers pay more for big ones and some pay less, depending on the variety.',
  'thin-skinned': 'Potatoes dug before their skins toughened. They sell at the No. 2 price unless they go straight from the field early in the season.',
  'knobs and cracks': 'Lumps and splits on potatoes that grew in spurts, when a dry spell was followed by rain. They drop to US No. 2.',
  scab: 'Rough, corky patches on the skin from a soil germ that thrives when the soil is dry. Scabby potatoes drop to US No. 2.',
  greened: 'Potatoes that grew up into the light turned green and bitter, so they can\'t be sold.',
  'thin skins': 'Skins that hadn\'t toughened when the field was dug. They need about two weeks after the vines die.',
  'tuber blight': 'Late blight that got into the potatoes themselves, washed down from the leaves. They rot, so they\'re culled.',
  'too small': 'Potatoes too small to grade. They go to the starch factory with the culls.',
  'stone bruise': 'Bruises from the digger knocking potatoes against stones. They drop to US No. 2.',
}

let seq = 0

// A word or phrase with its meaning in place. key: the glossary's entry, when it differs from the words shown. A screen
// reader hears the meaning as the word's description; it is not part of the sheet's text.
export function term(text: string, key = text.toLowerCase()): Child {
  const tip = GLOSSARY[key] ?? GLOSSARY[text]
  if (!tip) return text
  const id = `term-${++seq}`
  return h('span', { class: 'term', tabindex: '0', 'data-tip': tip, 'aria-describedby': id }, text, h('span', { id, hidden: true }, tip))
}

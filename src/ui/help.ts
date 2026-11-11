import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, icon } from './dom.ts'
import * as F from './fmt.ts'
import { JOB_KEY, jobWhat } from './rules.ts'

const REPO = 'https://github.com/TheMizeGuy/the-county'

export function openHelp(ctx: Ctx): void {
  const plantAt = F.temp(10)
  const touch = ctx.touch()
  const jobs: [S.JobKind, string][] = [
    ['plant', `When the soil reaches about ${plantAt}, usually in May. Seed in cold, wet ground rots, and the stand comes up thin.`],
    ['hill', 'Twice: when the plants are a hand high, and again before the rows close.'],
    ['scout', 'Weekly; every five days once the blight watch is on.'],
    ['spray', 'Before blight weather, and again as rain and new leaf wear it away.'],
    ['water', 'When the ground is dry while the tubers are sizing. Slow and costly without the irrigation reel; most growers here rely on rain. Wet ground cannot be watered.'],
    ['rogue', 'While there are only a few of them. To rogue a field is to pull out its sick plants.'],
    ['sample', 'After the tubers set. It usually narrows the yield estimate and is the only way to know tuber size before you kill the vines.'],
    ['kill', 'Early September, or sooner if blight is winning. Skins need two weeks.'],
    ['dig', 'Once the skins are set, and before the ground freezes. Two days a field without the harvester.'],
  ]
  ctx.dialogs.open({
    title: 'How it works',
    testid: 'how',
    wide: true,
    cls: 'help',
    body: () => h('div', { class: 'prose' },
      h('p', { class: 'lede' },
        'You farm six fields in Aroostook County, Maine. Every season is a real year, played on the weather NOAA recorded at Caribou. The crop grows underground, where you cannot see it, and you find out what you grew on the day you dig.'),
      h('h3', null, 'The year'),
      h('ol', { class: 'loop' },
        h('li', null, h('strong', null, 'Spring plan. '), 'Choose potatoes or a rest year for each field, and which variety. Buy equipment if there is cash.'),
        h('li', null, h('strong', null, 'Season. '), 'From late April the days run. You put jobs on the work list; the farmer works it in order, one day of work per day, skipping what the weather forbids. The clock stops itself when the coach has something new for you or something happens, and says why.'),
        h('li', null, h('strong', null, 'Dig day. '), 'Each field is graded tuber by tuber. Sell the crop off the field, or keep it in the cellar. The cellar charges from the day of the dig.'),
        h('li', null, h('strong', null, 'Winter. '), 'Sell from the cellar month by month, November to May. Prices usually rise; storage costs money, and the pile shrinks, sprouts and sometimes rots.'),
        h('li', null, h('strong', null, 'Year end. '), `You pay the bank ${F.money(S.NOTE_PAYMENT)} on the note (the farm's mortgage) and the household takes ${F.money(S.LIVING)}. Keep the farm through five seasons and it is yours.`)),
      h('h3', null, 'The jobs'),
      h('table', { class: 'jobs-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Job'), h('th', { scope: 'col' }, 'What it does'), h('th', { scope: 'col' }, 'When'))),
        h('tbody', null, jobs.map(([kind, when]) => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'job-name' }, icon(kind), S.JOB_LABEL[kind]), touch ? null : h('kbd', null, JOB_KEY[kind])),
          h('td', null, jobWhat(kind)), h('td', null, when))))),
      h('h3', null, 'Reading a field'),
      h('p', null,
        'Choose a field to see what a grower could know about it: how much leaf is up, how wet the soil is, how many times it was hilled, how much protectant is left, how much of the seed came up, and blight where someone has walked the rows, with how many days ago that was. ',
        `The yield is a guess, so it is drawn as a range. A test dig usually narrows it. The truth comes on dig day, when every ${F.hundredweight()} lost is put down to its cause.`),
      h('p', null,
        'Early dying (a soil disease, Verticillium) lives in the soil. It builds with each potato crop and fades slowly in rest years; plants that carry it go down about a third early. It is not thirst: a plant short of water droops, and the soil-water reading says so.'),
      h('h3', null, 'Looking at the land'),
      h('p', null, touch
        ? 'Drag to turn the land, pinch to zoom, and double tap to put the view back. Tap a field to choose it.'
        : 'Drag to turn the land, scroll to zoom, and double-click to put the view back. Click a field to choose it.'),
      h('h3', null, 'The forecast and the blight watch'),
      h('p', null,
        'Forecast highs and lows are ranges, and they widen with each day ahead. Rain is a chance, and the forecast can be wrong both ways. Frost chance is for the coldest field, down on the bottom land. ',
        `Late blight needs long, damp, mild spells. The game adds up "severity values" for that weather from ${F.date(2001, S.dayIndex(2001, S.SV_START.month, S.SV_START.dom))}, as the Blitecast system does; once the total reaches `,
        String(S.SV_THRESHOLD), ', the blight watch is on and spores can land on any day of blight weather. Protectant has to be on the leaf before they do, and there is nothing to protect until the plants are up.'),
      h('h3', null, 'Money'),
      h('p', null,
        `A potato field costs ${F.money(S.FIELD_COST)} a season to grow, plus ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)} for certified seed. Saved seed is free, but it carries more virus every year it is saved. A rest year in oats and clover costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)}, and puts the soil back. `,
        `Planting, hilling, spraying, vine kill, digging and watering are charged as the work is done, and the cellar charges ${F.storeRate(S.STORE_COST)}. `,
        `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring, repaid from the crop, at no charge. Debt still owed after the year-end bills is carried at ${F.pct(S.CREDIT_RATE)} interest, and if it is more than ${F.money(-S.CREDIT_LIMIT)} the bank calls the note.`),
      touch ? null : [
        h('h3', null, 'Keys'),
        h('ul', { class: 'keys' },
          h('li', null, h('kbd', null, '0'), ' pause the clock, wherever the focus is'),
          h('li', null, h('kbd', null, 'Space'), ' pause or run the clock (on a focused button, Space presses that button)'),
          h('li', null, h('kbd', null, '1'), ' ', h('kbd', null, '2'), ' ', h('kbd', null, '3'), ' clock speed'),
          h('li', null, h('kbd', null, '['), ' ', h('kbd', null, ']'), ' or arrow keys: step through the fields'),
          h('li', null, h('kbd', null, 'P H C S W R T K D'), ' queue a job on the chosen field; with ', h('kbd', null, 'Shift'), ', on every field that can take it'),
          h('li', null, h('kbd', null, 'Esc'), ' close a window, or let go of the field and of the focused button')),
      ],
      h('h3', null, 'Where the numbers come from'),
      h('p', null,
        'Weather: NOAA\'s daily record for the Caribou weather station (GHCN-Daily USW00014607), with hourly humidity from its ISD record. ',
        'Yields and prices: USDA\'s National Agricultural Statistics Service, Maine. ',
        'Crop growth, blight, storage and soil: the extension and research literature, including Blitecast, University of Maine Cooperative Extension and potato research on Maine varieties. ',
        'Every rule and its source is listed in the game\'s ',
        h('a', { href: `${REPO}/blob/main/docs/MODEL.md`, target: '_blank', rel: 'noopener' }, 'model notes'),
        ', and the reading behind them is in the ',
        h('a', { href: `${REPO}/tree/main/docs/research`, target: '_blank', rel: 'noopener' }, 'research notes'),
        '.')),
  })
}

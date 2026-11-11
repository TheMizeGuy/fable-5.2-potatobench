import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, icon } from './dom.ts'
import * as F from './fmt.ts'

const REPO = 'https://github.com/TheMizeGuy/the-county'

export function openHelp(ctx: Ctx): void {
  const plantAt = F.temp(10)
  const jobs: [S.JobKind, string, string, string][] = [
    ['plant', 'P', 'Puts the seed in.', `When the soil reaches about ${plantAt}, usually in May. Seed in cold, wet ground rots.`],
    ['hill', 'H', 'Pulls soil up over the row: covers the tubers, smothers weeds.', 'Twice: when the plants are a hand high, and again before the rows close.'],
    ['scout', 'C', 'Walks the field looking for blight and virus.', 'Weekly; every five days once the blight watch is on.'],
    ['spray', 'S', 'Puts protectant on the leaves. It stops spores; it does not cure.', 'Before blight weather, and again as rain and new leaf wear it away.'],
    ['water', 'W', `Irrigates ${F.metric() ? 'about 25 mm' : 'about an inch'}.`, 'When the ground is dry while the tubers are sizing.'],
    ['rogue', 'R', 'Pulls and bags the blighted plants you have found.', 'While there are only a few of them.'],
    ['sample', 'T', 'Lifts one hill so you can see the tubers.', 'After the tubers set. It narrows the yield estimate.'],
    ['kill', 'K', 'Kills the vines. The crop stops growing and the skins start to set.', 'Early September, or sooner if blight is winning. Skins need two weeks.'],
    ['dig', 'D', 'Lifts the crop: two days a field.', 'Once the skins are set, and before the ground freezes.'],
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
        h('li', null, h('strong', null, 'Season. '), 'From late April the days run. You put jobs on the work list; the farmer works it in order, one day of work per day, skipping what the weather forbids. The clock stops itself when something needs you.'),
        h('li', null, h('strong', null, 'Dig day. '), 'Each field is graded tuber by tuber. Sell the crop off the field, or keep it in the cellar.'),
        h('li', null, h('strong', null, 'Winter. '), 'Sell from the cellar month by month, November to May. Prices usually rise; the pile shrinks, sprouts and sometimes rots.'),
        h('li', null, h('strong', null, 'Year end. '), `The bank takes the note (${F.money(S.NOTE_PAYMENT)}) and the household takes ${F.money(S.LIVING)}. Keep the farm through five seasons and it is yours.`)),
      h('h3', null, 'The jobs'),
      h('table', { class: 'jobs-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Job'), h('th', { scope: 'col' }, 'What it does'), h('th', { scope: 'col' }, 'When'))),
        h('tbody', null, jobs.map(([kind, key, what, when]) => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'job-name' }, icon(kind), S.JOB_LABEL[kind]), h('kbd', null, key)),
          h('td', null, what), h('td', null, when))))),
      h('h3', null, 'Reading a field'),
      h('p', null,
        'Choose a field to see what a grower could know about it: how much leaf is up, how wet the soil is, how many times it was hilled, how much protectant is left, and blight where someone has walked the rows, with how many days ago that was. ',
        'The yield is a guess, so it is drawn as a range. Each test dig narrows it. The truth comes on dig day, when every hundredweight lost is put down to its cause.'),
      h('h3', null, 'The forecast and the blight watch'),
      h('p', null,
        'Forecast highs and lows are ranges, and they widen with each day ahead. Rain is a chance. Frost chance is for the coldest field, down on the bottom land. ',
        'Late blight needs long, damp, mild spells. Growers here add up "severity values" for that weather from May 25 (the Blitecast system); once the total passes ',
        String(S.SV_THRESHOLD), ', the blight watch is on and spores can land any day. Protectant has to be on the leaf before they do.'),
      h('h3', null, 'Money'),
      h('p', null,
        `A potato field costs ${F.money(S.FIELD_COST)} a season to grow, plus ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)} for certified seed. A rest year in oats and clover costs ${F.money(S.REST_COST)}, earns ${F.money(S.REST_INCOME)}, and puts the soil back. `,
        `The bank lends up to ${F.money(-S.OPERATING_LIMIT)} for the spring, repaid from the crop. End a year more than ${F.money(-S.CREDIT_LIMIT)} in debt and it calls the note.`),
      h('h3', null, 'Keys'),
      h('ul', { class: 'keys' },
        h('li', null, h('kbd', null, 'Space'), ' pause or run the clock'),
        h('li', null, h('kbd', null, '1'), ' ', h('kbd', null, '2'), ' ', h('kbd', null, '3'), ' clock speed'),
        h('li', null, h('kbd', null, '['), ' ', h('kbd', null, ']'), ' or arrow keys: step through the fields'),
        h('li', null, h('kbd', null, 'P H C S W R T K D'), ' queue a job on the chosen field'),
        h('li', null, h('kbd', null, 'Esc'), ' close a window, or let go of the field')),
      h('h3', null, 'Where the numbers come from'),
      h('p', null,
        'Weather: NOAA\'s daily record for the Caribou weather station (GHCN-Daily USW00014607), with hourly humidity from its ISD record. ',
        'Yields and prices: USDA\'s National Agricultural Statistics Service, Maine. ',
        'Crop growth, blight, storage and soil: the extension and research literature, including Blitecast, University of Maine Cooperative Extension and potato research on Maine varieties. ',
        'Every rule and its source is written up in the game\'s ',
        h('a', { href: `${REPO}/tree/main/docs/research`, target: '_blank', rel: 'noopener' }, 'research notes'),
        '.')),
  })
}

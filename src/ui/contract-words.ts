// What a contract is shown to be getting, and why it looks like falling short, from the simulation's outlook.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// What a contract looks like getting by its due date: delivered, in hand, and the No. 1 its fields are expected to
// give at the harvest (sim/outlook.ts, contractOutlook). null when nothing more is coming to it.
export function giving(c: S.Campaign, id: S.VarietyId, cwt: number, delivered = 0): S.ContractOutlook | null {
  const g = S.contractOutlook(c, id, cwt, delivered)
  return g.hi > delivered + 0.5 ? g : null
}

// Why a contract looks like falling short, in one sentence, or '': only when even the top of what it looks like
// getting is under the promise, and never as a loss already made. A closed contract's penalty is said apart.
export function shortWhy(c: S.Campaign, k: S.ContractInfo): string {
  if (k.settled || k.needed <= 1e-6) return ''
  const g = S.contractOutlook(c, k.variety, k.cwt, k.delivered)
  if (!g.short) return ''
  const name = k.varietyName
  if (c.phase === 'plan') {
    return g.short === 'none' ? `Your plan has no ${name} for this contract yet, so give it a field on the map before the season starts.`
      : `Too few acres of ${name} are planned to fill this even in a good year, so give it another field before the season starts.`
  }
  const least = F.money((k.cwt - g.hi) * k.price * S.CONTRACT_PENALTY)
  switch (g.short) {
    case 'none': return `You didn't plant any ${name} this year, so expect a penalty of about ${least}.`
    case 'acres': return `Too few acres of ${name} are planted to fill this even in a good year, so expect a penalty of at least ${least}.`
    case 'crop': return `Your ${name} is yielding too little to fill this even at the top of the estimate, so expect a penalty of at least ${least}.`
    default: return `Your ${name} harvest came to less than you promised, so expect a penalty of about ${least}.`
  }
}

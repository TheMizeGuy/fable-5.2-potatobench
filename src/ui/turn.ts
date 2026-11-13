// Whether a slip nobody asked for waits its turn: the rows are full and one holds a warning, or the answer to the
// player's own press, too new to have been read.
export const READ_MS = 6000

export function waitsItsTurn(rows: { level: string; born: number; answer?: boolean }[], keep: number, now: number): boolean {
  return rows.length >= keep && rows.some(n => (n.level === 'warn' || n.level === 'bad' || n.answer) && now - n.born < READ_MS)
}

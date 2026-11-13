// Whether a slip nobody asked for waits its turn: the rows are full and one of them is too new to have been read,
// a warning or the answer to something the player just did.
export const READ_MS = 6000

export function waitsItsTurn(rows: { born: number }[], keep: number, now: number): boolean {
  return rows.length >= keep && rows.some(n => now - n.born < READ_MS)
}

// The parts of a frame, named on the browser's own timeline (User Timing) while a tool asks for it
// (tools/render/hitch.ts). Left alone, nothing is measured or kept.
let on = false, from = 0

export const laps = {
  watch(yes: boolean): void { on = yes },
  // A run of parts begins.
  begin(): void { if (on) from = performance.now() },
  // The part that began where the last one ended is over.
  end(name: string): void {
    if (!on) return
    const now = performance.now()
    performance.measure(`county:${name}`, { start: from, end: now })
    from = now
  },
}

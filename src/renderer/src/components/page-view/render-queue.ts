// One queue for every page render on screen. pdf.js renders one page at a
// time per document anyway; queuing here lets the visible pages go first,
// and drops work for pages the user has already scrolled past before it
// ever starts.

export interface RenderJob {
  // Lower runs first: 0 visible now, 1 near the viewport.
  priority: number
  run: () => Promise<void>
  // Checked right before starting; a cancelled job is skipped.
  cancelled: () => boolean
}

const CONCURRENCY = 3
const queue: RenderJob[] = []
let running = 0

function pump(): void {
  while (running < CONCURRENCY && queue.length > 0) {
    let best = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].priority < queue[best].priority) best = i
    const [job] = queue.splice(best, 1)
    if (job.cancelled()) continue
    running++
    void job
      .run()
      .catch(() => {})
      .finally(() => {
        running--
        pump()
      })
  }
}

export function enqueueRender(job: RenderJob): void {
  queue.push(job)
  pump()
}

// How much of the queue is waiting (for tests and diagnostics).
export const pendingRenders = (): number => queue.length + running

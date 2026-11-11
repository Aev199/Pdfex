// One queue for every page render on screen. pdf.js renders one page at a
// time per document anyway; queuing here lets the visible pages go first,
// and drops work for pages the user has already scrolled past before it
// ever starts.
//
// pdf.js draws a page in slices of about 15 ms, each in an animation frame.
// While the canvas is being zoomed or panned those slices land in the same
// frames as the motion and stretch them to 50-100 ms: the board stutters.
// So while the camera moves, renders that only sharpen a page already on
// screen are held between slices and go on once it stops. Pages with
// nothing on them yet keep drawing, so zooming out doesn't show blank sheets.
//
// Several pages render at once (their parsing runs in pdf.js's worker), but
// their slices take turns: at most one per frame. Three in one frame make
// a 50 ms frame that the next wheel notch has to wait for; one per frame
// draws about as fast, since they all share the one main thread anyway.

import type { RenderTask } from 'pdfjs-dist'

export interface RenderJob {
  // Lower runs first: 0 visible now, 1 near the viewport.
  priority: number
  run: () => Promise<void>
  // Checked right before starting; a cancelled job is skipped.
  cancelled: () => boolean
  // The page has nothing drawn yet: keeps drawing while the camera moves.
  urgent?: boolean
}

const CONCURRENCY = 3
// The camera counts as still this long after it last moved.
const STILL_AFTER_MS = 150

const queue: RenderJob[] = []
let running = 0
// Renders waiting for the camera to stop, with the call that resumes each.
const held = new Map<RenderTask, () => void>()
let movingUntil = 0
let stillTimer: number | null = null

const moving = (): boolean => performance.now() < movingUntil

function pump(): void {
  // Held renders don't take a slot from a page that needs drawing.
  while (running - held.size < CONCURRENCY && queue.length > 0) {
    let best = -1
    for (let i = 0; i < queue.length; i++) {
      if (moving() && !queue[i].urgent) continue
      if (best === -1 || queue[i].priority < queue[best].priority) best = i
    }
    if (best === -1) return
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

// Slices waiting for a frame of their own.
const ready: Array<() => void> = []
// A slice is already booked for the coming frame.
let booked = false
let ticking = false

function tick(): void {
  booked = false
  const go = ready.shift()
  if (!go) {
    ticking = false
    return
  }
  // Ahead of the slice's own frame callback, so it runs first next frame.
  requestAnimationFrame(tick)
  booked = true
  go()
}

// `go` asks pdf.js for the next slice, which it runs in the next frame.
function nextSlice(go: () => void): void {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(tick)
  }
  if (booked) {
    ready.push(go)
    return
  }
  booked = true
  go()
}

function release(): void {
  stillTimer = null
  const wait = movingUntil - performance.now()
  if (wait > 0) {
    stillTimer = window.setTimeout(release, wait)
    return
  }
  const resume = [...held.values()]
  held.clear()
  for (const go of resume) nextSlice(go)
  pump()
}

// Called on every step of a zoom or pan.
export function cameraMoved(): void {
  movingUntil = performance.now() + STILL_AFTER_MS
  if (stillTimer === null) stillTimer = window.setTimeout(release, STILL_AFTER_MS)
}

// Schedule a started render's slices: one per frame across all renders,
// and, unless `urgent`, none while the camera moves.
export function scheduleSlices(task: RenderTask, urgent: boolean): void {
  task.onContinue = (go: () => void) => {
    if (urgent || !moving()) {
      nextSlice(go)
      return
    }
    held.set(task, go)
    pump()
  }
  // A cancelled render resumes only to stop; drop it from the held set.
  void task.promise.then(
    () => held.delete(task),
    () => held.delete(task)
  )
}

export function enqueueRender(job: RenderJob): void {
  queue.push(job)
  pump()
}

// How much of the queue is waiting (for tests and diagnostics).
export const pendingRenders = (): number => queue.length + running

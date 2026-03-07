import { MAX_DELTA } from "../constants";

export type UpdateFn = (deltaSec: number) => void;
export type RenderFn = () => void;

/**
 * Create a game loop using requestAnimationFrame.
 * Passes delta in **seconds** to update, capped by MAX_DELTA.
 * Returns a cleanup function to stop the loop.
 */
export function createGameLoop(update: UpdateFn, renderFrame: RenderFn): () => void {
  let rafId = 0;
  let lastTime = 0;
  let running = true;

  function loop(timestamp: number) {
    if (!running) return;

    if (lastTime === 0) {
      lastTime = timestamp;
    }

    let deltaSec = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap delta for background tab recovery
    if (deltaSec > MAX_DELTA) {
      deltaSec = MAX_DELTA;
    }

    update(deltaSec);
    renderFrame();
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
}

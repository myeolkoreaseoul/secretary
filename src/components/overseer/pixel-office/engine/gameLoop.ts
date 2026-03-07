import { FRAME_INTERVAL, MAX_DELTA } from "../constants";

export type UpdateFn = (deltaMs: number) => void;
export type RenderFn = () => void;

/**
 * Create a game loop throttled to TARGET_FPS.
 * Returns a cleanup function to stop the loop.
 */
export function createGameLoop(update: UpdateFn, renderFrame: RenderFn): () => void {
  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let running = true;

  function loop(timestamp: number) {
    if (!running) return;

    if (lastTime === 0) {
      lastTime = timestamp;
    }

    let delta = timestamp - lastTime;
    lastTime = timestamp;

    // Cap delta for background tab recovery
    if (delta > MAX_DELTA) {
      delta = MAX_DELTA;
    }

    accumulator += delta;

    // Fixed timestep updates
    while (accumulator >= FRAME_INTERVAL) {
      update(FRAME_INTERVAL);
      accumulator -= FRAME_INTERVAL;
    }

    renderFrame();
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
}

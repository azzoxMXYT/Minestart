// Count game frames that pass the frame limiter, not every browser animation callback.
class FrameRate {
  constructor(windowMs = 600) {
    this.windowMs = windowMs;
    this.reset();
  }

  reset() {
    this.start = null;
    this.frames = 0;
  }

  tick(now) {
    if (this.start === null) {
      this.start = now;
      return null;
    }
    this.frames++;
    const elapsed = now - this.start;
    if (elapsed < this.windowMs) return null;
    const rate = Math.round(this.frames * 1000 / elapsed);
    this.start = now;
    this.frames = 0;
    return rate;
  }
}

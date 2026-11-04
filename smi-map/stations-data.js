// Galaxy layout: where each seat (airplane window) sits.
// Matches the Figma frame: rows ~304px apart, 3-window rows at x=24 and 4-window rows shifted left.
// The frame is the top-left corner of the galaxy; it extends right and down.
const DX = 262, DY = 304, EVEN_X = 24, ODD_X = -122, TOP = 202, COLS = 10;

// Seats ordered nearest-first from the top-left, so early joiners are on screen when the page opens.
export function makeSeats(count) {
  const rows = Math.max(15, Math.ceil(count / (COLS + 0.5)) + 2);
  const seats = [];
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < COLS + (odd ? 1 : 0); c++) {
      seats.push({ x: (odd ? ODD_X : EVEN_X) + c * DX, y: TOP + r * DY });
    }
  }
  return seats.sort((a, b) => Math.hypot(a.x, (a.y - TOP) * 1.8) - Math.hypot(b.x, (b.y - TOP) * 1.8));
}

/**
 * Pure math for the person crop step. The frame displays the image with
 * object-cover base scaling, an extra zoom factor, and a pixel offset; these
 * functions mirror that model so the canvas export crops exactly what the
 * frame shows.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function coverScale(natural: Size, container: Size): number {
  if (
    natural.width <= 0 ||
    natural.height <= 0 ||
    container.width <= 0 ||
    container.height <= 0
  ) {
    return 1;
  }
  return Math.max(container.width / natural.width, container.height / natural.height);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Keep the zoomed image covering the frame: each axis clamps to its slack
 * ((displayed - container) / 2). A zero-size container (unmeasured, as in
 * jsdom) yields near-unbounded slack, i.e. the candidate passes through.
 */
export function clampOffset(
  params: { natural: Size; container: Size; zoom: number },
  candidate: Point,
): Point {
  const scale = coverScale(params.natural, params.container) * params.zoom;
  const slackX = (params.natural.width * scale - params.container.width) / 2;
  const slackY = (params.natural.height * scale - params.container.height) / 2;
  return {
    x: clamp(candidate.x, -slackX, slackX),
    y: clamp(candidate.y, -slackY, slackY),
  };
}

/** The frame's visible region expressed in source-image pixels. */
export function computeCropRect(params: {
  natural: Size;
  container: Size;
  zoom: number;
  offset: Point;
}): { sx: number; sy: number; sw: number; sh: number } {
  const scale = coverScale(params.natural, params.container) * params.zoom;
  const x0 = (params.container.width - params.natural.width * scale) / 2 + params.offset.x;
  const y0 = (params.container.height - params.natural.height * scale) / 2 + params.offset.y;
  return {
    sx: -x0 / scale,
    sy: -y0 / scale,
    sw: params.container.width / scale,
    sh: params.container.height / scale,
  };
}

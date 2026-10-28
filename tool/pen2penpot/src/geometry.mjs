// SVG path helpers: tight bounding box and affine mapping into the node box.

import svgpath from 'svgpath';

function cubicExtrema(p0, p1, p2, p3) {
  // Roots of the derivative of a cubic Bezier in one dimension.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

// Tight bounding box of an SVG path, as [x, y, w, h].
export function pathBBox(d) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg) => {
      const [cmd, ...a] = seg;
      switch (cmd) {
        case 'M':
          cx = sx = a[0];
          cy = sy = a[1];
          add(cx, cy);
          break;
        case 'L':
          cx = a[0];
          cy = a[1];
          add(cx, cy);
          break;
        case 'H':
          cx = a[0];
          add(cx, cy);
          break;
        case 'V':
          cy = a[0];
          add(cx, cy);
          break;
        case 'Q': {
          // Elevate to cubic.
          const c1x = cx + (2 / 3) * (a[0] - cx);
          const c1y = cy + (2 / 3) * (a[1] - cy);
          const c2x = a[2] + (2 / 3) * (a[0] - a[2]);
          const c2y = a[3] + (2 / 3) * (a[1] - a[3]);
          for (const t of cubicExtrema(cx, c1x, c2x, a[2])) add(cubicAt(cx, c1x, c2x, a[2], t), cubicAt(cy, c1y, c2y, a[3], t));
          for (const t of cubicExtrema(cy, c1y, c2y, a[3])) add(cubicAt(cx, c1x, c2x, a[2], t), cubicAt(cy, c1y, c2y, a[3], t));
          cx = a[2];
          cy = a[3];
          add(cx, cy);
          break;
        }
        case 'C': {
          for (const t of cubicExtrema(cx, a[0], a[2], a[4])) add(cubicAt(cx, a[0], a[2], a[4], t), cubicAt(cy, a[1], a[3], a[5], t));
          for (const t of cubicExtrema(cy, a[1], a[3], a[5])) add(cubicAt(cx, a[0], a[2], a[4], t), cubicAt(cy, a[1], a[3], a[5], t));
          cx = a[4];
          cy = a[5];
          add(cx, cy);
          break;
        }
        case 'Z':
          cx = sx;
          cy = sy;
          break;
        default:
          break;
      }
    });
  if (minX === Infinity) return [0, 0, 0, 0];
  return [minX, minY, maxX - minX, maxY - minY];
}

// The viewBox pen maps onto the node box: explicit, else the tight bbox.
export function pathViewBox(node) {
  return node.viewBox ?? pathBBox(node.geometry ?? '');
}

// Maps path data from viewBox space into a box at (x, y) of size w x h, the
// way pen stretches a path's viewBox onto its node box.
export function mapPath(d, viewBox, x, y, w, h) {
  const [vx, vy, vw, vh] = viewBox;
  const sx = vw ? w / vw : 1;
  const sy = vh ? h / vh : 1;
  return svgpath(d)
    .translate(-vx, -vy)
    .scale(sx, sy)
    .translate(x, y)
    .abs()
    .unarc()
    .round(3)
    .toString();
}

// Maps path data with a uniform scale and offset (icons).
export function placePath(d, s, tx, ty) {
  return svgpath(d).abs().unarc().scale(s).translate(tx, ty).round(3).toString();
}

// Maps pen font families to Penpot fonts.
//
// Inter, JetBrains Mono and SF Mono are uploaded to the Penpot team from the
// same files the HTML reference render uses (see bin/upload-fonts.mjs), so the
// Penpot render and the reference share glyphs. Arial has no open copy; it maps
// to Arimo, its metric-compatible open counterpart, from Penpot's Google Fonts
// catalogue. Without uploaded fonts every family falls back to the catalogue.

const nearest = (available, weight) => {
  // CSS font matching for weights above 500: heavier first, then lighter.
  const w = Number(weight);
  const sorted = [...available].map(Number).sort((a, b) => a - b);
  if (sorted.includes(w)) return w;
  if (w > 500) {
    const up = sorted.find((x) => x > w);
    if (up !== undefined) return up;
    return sorted.filter((x) => x < w).pop();
  }
  const down = sorted.filter((x) => x < w).pop();
  return down ?? sorted.find((x) => x > w);
};

function gfont(slug, family, weights) {
  return {
    fontId: `gfont-${slug}`,
    family,
    weights,
    variant(weight) {
      const w = nearest(weights, weight);
      return { id: w === 400 ? 'regular' : String(w), weight: String(w) };
    },
  };
}

function custom(fontId, family, weights) {
  return {
    fontId: `custom-${fontId}`,
    family,
    weights,
    variant(weight) {
      const w = nearest(weights, weight);
      return { id: `normal-${w}`, weight: String(w) };
    },
  };
}

// `uploaded` is { family: { fontId, weights: [...] } } as written by
// bin/upload-fonts.mjs, or null.
export function fontTable(uploaded) {
  const t = {
    Inter: gfont('inter', 'Inter', [100, 200, 300, 400, 500, 600, 700, 800, 900]),
    'JetBrains Mono': gfont('jetbrains-mono', 'JetBrains Mono', [100, 200, 300, 400, 500, 600, 700, 800]),
    'SF Mono': { ...gfont('jetbrains-mono', 'JetBrains Mono', [100, 200, 300, 400, 500, 600, 700, 800]), substitute: true },
    Arial: { ...gfont('arimo', 'Arimo', [400, 500, 600, 700]), substitute: true },
  };
  for (const [family, f] of Object.entries(uploaded ?? {})) {
    t[family] = custom(f.fontId, family, f.weights);
  }
  return t;
}

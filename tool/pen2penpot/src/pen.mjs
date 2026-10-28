// Reads a .pen document: variable resolution and `ref` expansion.
//
// The expanded tree keeps what the Penpot writer needs to rebuild components:
// the root of every instance carries `_inst: true` and `_comp` (the id of the
// reusable node it copies). A node inside an instance matches the node at the
// same relative id path inside the component's main tree.

import { readFileSync } from 'node:fs';

export function loadPen(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return new PenDoc(doc);
}

const clone = (o) => structuredClone(o);

export class PenDoc {
  constructor(doc) {
    this.doc = doc;
    this.variables = doc.variables ?? {};
    this.byId = new Map();
    // The canvas holds sections (`01   CURRENT UX`, ...). Each section holds
    // its title texts and area frames (`02  Effects · chains & controls`),
    // and each area holds screen cards: a label, the screen and its notes.
    // An area is the unit the converter lays out and writes as one board.
    this.sections = doc.children.filter((n) => n.type === 'frame');
    this.units = [];
    this.unitOf = new Map();
    this.sectionOf = new Map();
    for (const section of this.sections) {
      for (const child of section.children ?? []) {
        if (child.type !== 'frame') continue;
        this.units.push(child);
        this.sectionOf.set(child.id, section);
      }
    }
    for (const top of doc.children) this.#index(top, null);
  }

  #index(node, unit) {
    const u = unit ?? (this.sectionOf.has(node.id) ? node : null);
    if (node.id) {
      this.byId.set(node.id, node);
      if (u) this.unitOf.set(node.id, u);
    }
    for (const c of node.children ?? []) this.#index(c, u);
  }

  // Texts placed directly on a section: its title and description.
  sectionTexts(section) {
    return (section.children ?? []).filter((n) => n.type === 'text');
  }

  // Variable lookup. Values may chain through other variables. There are no
  // themes in our file, so a themed value list resolves to its first entry
  // without a theme, else the first entry.
  varValue(name) {
    const v = this.variables[name];
    if (!v) throw new Error(`unknown variable $${name}`);
    let value = v.value;
    if (Array.isArray(value)) {
      value = (value.find((e) => !e.theme) ?? value[0]).value;
    }
    return this.resolve(value);
  }

  resolve(value) {
    // A string that names no variable is a literal (text content can start
    // with a dollar sign).
    if (typeof value === 'string' && value.startsWith('$') && value.slice(1) in this.variables) {
      return this.varValue(value.slice(1));
    }
    return value;
  }

  // Name of the variable a value is bound to, following one level only (the
  // binding the designer chose), or undefined.
  static varName(value) {
    return typeof value === 'string' && value.startsWith('$') ? value.slice(1) : undefined;
  }

  // Returns the expanded copy of a top-level node: refs replaced by their
  // component trees with overrides applied. Each expanded node gets `_path`,
  // an id path unique within the screen.
  expand(node) {
    const out = this.#expandNode(clone(node), 0);
    assignPaths(out, '');
    return out;
  }

  #expandNode(node, depth) {
    if (depth > 40) throw new Error(`ref nesting too deep at ${node.id}`);
    if (node.enabled === false) node._hidden = true;
    if (node.type === 'ref') return this.#expandRef(node, depth);
    if (node.children) {
      node.children = node.children
        .map((c) => this.#expandNode(c, depth + 1))
        .filter(Boolean);
    }
    return node;
  }

  #expandRef(ref, depth) {
    const target = this.byId.get(ref.ref);
    if (!target) throw new Error(`ref ${ref.id} points at missing ${ref.ref}`);
    // Expand the component itself first (it may be a ref, or contain refs).
    const comp = this.#expandNode(clone(target), depth + 1);
    const root = comp;
    // Instance-level property overrides on the root.
    for (const [k, v] of Object.entries(ref)) {
      if (['type', 'ref', 'descendants', 'reusable', 'children'].includes(k)) continue;
      root[k] = v;
    }
    root.id = ref.id;
    root._inst = true;
    root._comp = target.id;
    root.reusable = ref.reusable === true;
    const structural = [];
    for (const [path, ov] of Object.entries(ref.descendants ?? {})) {
      const segs = path.split('/');
      const hit = findPath(root, segs);
      if (!hit) {
        // pen ignores overrides whose target no longer exists.
        continue;
      }
      const { node: tgt, parent } = hit;
      if ('type' in ov) {
        // Full replacement with a new subtree.
        const repl = this.#expandNode(clone(ov), depth + 1);
        const idx = parent.children.indexOf(tgt);
        parent.children[idx] = repl;
        structural.push(path);
        continue;
      }
      for (const [k, v] of Object.entries(ov)) {
        if (k === 'children') {
          tgt.children = v.map((c) => this.#expandNode(clone(c), depth + 1)).filter(Boolean);
          structural.push(path);
        } else {
          tgt[k] = v;
        }
      }
      tgt._hidden = tgt.enabled === false;
    }
    if (structural.length) root._structural = structural;
    root._hidden = root.enabled === false;
    return root;
  }
}

// Finds the node addressed by an id path inside an instance. The first segment
// is searched without entering nested instances; following segments continue
// from the nested instance that matched.
function findPath(root, segs) {
  let scope = root;
  let found = null;
  for (let i = 0; i < segs.length; i++) {
    found = findInScope(scope, segs[i]);
    if (!found) return null;
    scope = found.node;
  }
  return found;
}

function findInScope(scope, id) {
  const stack = [...(scope.children ?? []).map((c) => [c, scope])];
  while (stack.length) {
    const [n, parent] = stack.shift();
    if (n.id === id) return { node: n, parent };
    if (n._inst) continue;
    for (const c of n.children ?? []) stack.push([c, n]);
  }
  return null;
}

function assignPaths(node, prefix) {
  node._path = prefix ? `${prefix}/${node.id}` : node.id;
  for (const c of node.children ?? []) assignPaths(c, node._path);
}

// Walks a tree depth first.
export function* walk(node, parent = null) {
  yield [node, parent];
  for (const c of node.children ?? []) yield* walk(c, node);
}

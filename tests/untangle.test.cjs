const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../philosophy-graph-site/dist/app.js'), 'utf8');
const functions = source.slice(source.indexOf('  function layoutLoops()'), source.indexOf('  function outcomeText('))
  + source.slice(source.indexOf('  function layoutUntangled()'), source.indexOf('  function simulate()'));

function graph(routes) {
  const state = { nodes: new Map([['Philosophy', { title: 'Philosophy', x: 0, y: 0, vx: 3, vy: 3 }]]), edges: new Map(),
    paths: routes.map(titles => ({ titles, outcome: titles.at(-1) === 'Philosophy' ? 'reached' : titles.slice(0, -1).includes(titles.at(-1)) ? 'loop' : 'dead' })),
    loopTargets: new Map(), cycleEdges: new Map() };
  for (const route of routes) route.forEach((title, i) => {
    state.nodes.set(title, { title, x: Math.random() * 100, y: Math.random() * 100, vx: 3, vy: 3 });
    if (i) state.edges.set(`${route[i - 1]}\u0000${title}`, { from: route[i - 1], to: title });
  });
  const context = vm.createContext({ state });
  vm.runInContext(functions, context);
  return { state, untangle: () => context.layoutUntangled() };
}
function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

test('branching routes untangle without crossings, overlaps, or topology changes', () => {
  const { state, untangle } = graph([
    ['Cat', 'Carnivore', 'Latin', 'Classical language', 'Language', 'Communication', 'Information', 'Abstract and concrete', 'Philosophy'],
    ['Book', 'Writing', 'Language', 'Communication', 'Information', 'Abstract and concrete', 'Philosophy'],
    ['Genre', 'French language', 'Language', 'Communication', 'Information', 'Abstract and concrete', 'Philosophy'],
    ['Other', 'Information', 'Abstract and concrete', 'Philosophy']
  ]);
  const before = [...state.edges.keys()];
  untangle();
  assert.deepEqual([...state.edges.keys()], before);
  const nodes = [...state.nodes.values()], edges = [...state.edges.values()];
  for (const node of nodes) { assert.equal(node.vx, 0); assert.equal(node.vy, 0); }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) >= 100);
  }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j];
    assert.equal(crosses(state.nodes.get(a.from), state.nodes.get(a.to), state.nodes.get(b.from), state.nodes.get(b.to)), false);
  }
  assert.equal(state.nodes.get('Philosophy').x, 0);
  assert.equal(state.nodes.get('Philosophy').y, 0);
  const positions = nodes.map(node => [node.title, node.x, node.y]);
  untangle();
  assert.deepEqual(nodes.map(node => [node.title, node.x, node.y]), positions, 'repeated clicks do not scramble the graph');
});

test('loops remain circular and separate from routes reaching Philosophy', () => {
  const { state, untangle } = graph([
    ['Cat', 'Language', 'Philosophy'], ['Moon', 'Universe', 'Existence', 'Reality', 'Existence'],
    ['Lenin', 'Time', 'Existence', 'Reality', 'Existence']
  ]);
  untangle();
  assert.equal(state.cycleEdges.size, 2);
  const circle = state.cycleEdges.get('Existence\u0000Reality');
  for (const title of ['Existence', 'Reality']) {
    const node = state.nodes.get(title);
    assert.ok(Math.abs(Math.hypot(node.x - circle.x, node.y - circle.y) - circle.radius) < 1e-8);
  }
  assert.notEqual(state.nodes.get('Time').x, state.nodes.get('Universe').x);
  const leftOfLoops = Math.min(...[...state.loopTargets.values()].map(point => point.x));
  const rightOfTree = Math.max(...[...state.nodes.values()].filter(node => !state.loopTargets.has(node.title)).map(node => node.x));
  assert.ok(leftOfLoops - rightOfTree >= 150);
});

test('dead ends, disconnected routes, and a cleared graph receive finite positions', () => {
  const { state, untangle } = graph([['One', 'Dead end'], ['Two', 'Another dead end'], ['Isolated']]);
  untangle();
  const positions = [...state.nodes.values()].map(node => `${node.x},${node.y}`);
  assert.equal(new Set(positions).size, state.nodes.size);
  for (const node of state.nodes.values()) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
  const cleared = graph([]);
  cleared.untangle();
  assert.equal(cleared.state.nodes.get('Philosophy').x, 0);
  assert.equal(cleared.state.nodes.get('Philosophy').y, 0);
});

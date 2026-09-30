const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped layout functions without a browser or Wikipedia requests.
const source = fs.readFileSync(path.join(__dirname, '../philosophy-graph-site/dist/app.js'), 'utf8');
const functions = source.slice(source.indexOf('  function layoutLoops()'), source.indexOf('  function outcomeText('));
function layout(routes) {
  const state = {
    paths: routes.map(titles => ({ titles, outcome: 'loop' })),
    nodes: new Map(routes.flat().map(title => [title, { x: 0, y: 0, vx: 1, vy: 1 }])),
    loopTargets: new Map(), cycleEdges: new Map()
  };
  const context = vm.createContext({ state });
  vm.runInContext(functions + '\nlayoutLoops();', context);
  return { state, arc: cycle => context.cycleArc(cycle) };
}

test('a cycle forms a ring and its approach stays outside it', () => {
  const { state } = layout([['Start', 'A', 'B', 'C', 'A']]);
  const circle = state.cycleEdges.get('A\u0000B');
  for (const title of ['A', 'B', 'C']) {
    const node = state.nodes.get(title);
    assert.ok(Math.abs(Math.hypot(node.x - circle.x, node.y - circle.y) - circle.radius) < 1e-8);
    assert.equal(node.vx, 0);
    assert.equal(node.vy, 0);
  }
  const approach = state.nodes.get('Start');
  assert.ok(Math.hypot(approach.x - circle.x, approach.y - circle.y) > circle.radius);
});

test('a two-page loop draws two different arcs instead of overlapping lines', () => {
  const { state, arc } = layout([['Existence', 'Reality', 'Existence']]);
  assert.equal(state.cycleEdges.size, 2);
  const forward = arc(state.cycleEdges.get('Existence\u0000Reality'));
  const reverse = arc(state.cycleEdges.get('Reality\u0000Existence'));
  assert.notEqual(forward, reverse);
  assert.match(forward, / A /);
  assert.ok(!forward.includes('NaN'));
});

test('a self loop draws an almost full circle', () => {
  const { state, arc } = layout([['A', 'A']]);
  assert.equal(state.cycleEdges.size, 1);
  assert.match(arc(state.cycleEdges.get('A\u0000A')), / 0 1 1 /);
});

test('routes entering the same cycle share one ring', () => {
  const { state } = layout([['One', 'A', 'B', 'C', 'A'], ['Two', 'B', 'C', 'A', 'B']]);
  assert.equal(state.cycleEdges.size, 3);
  assert.equal(state.loopTargets.size, 5);
  const circles = [...state.cycleEdges.values()];
  assert.ok(circles.every(circle => circle.x === circles[0].x && circle.y === circles[0].y));
});

test('distinct cycles have separate rings', () => {
  const { state } = layout([['A', 'B', 'A'], ['C', 'D', 'C']]);
  const one = state.cycleEdges.get('A\u0000B');
  const two = state.cycleEdges.get('C\u0000D');
  assert.ok(two.x - one.x > one.radius + two.radius);
});

const lenin = ['Vladimir Lenin', 'Old Style and New Style dates', 'Julian calendar', 'Solar calendar', 'Calendar', 'Day', 'Time', 'Existence', 'Reality', 'Existence'];
const moon = ['Moon', 'Natural satellite', 'Astronomical object', 'Universe', 'Existence', 'Reality', 'Existence'];

test('Lenin and Moon have separate approach branches into one shared loop', () => {
  const { state } = layout([lenin, moon]);
  assert.equal(state.cycleEdges.size, 2);
  assert.equal(state.loopTargets.size, 13);
  const positions = [...state.loopTargets.values()];
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 110);
  }
  assert.ok(Math.abs(state.nodes.get('Time').x - state.nodes.get('Universe').x) >= 240);
});

test('merged suffixes stay shared while incoming branches occupy different lanes', () => {
  const { state } = layout([['One', 'Shared', 'A', 'B', 'A'], ['Two', 'Shared', 'A', 'B', 'A']]);
  assert.equal(state.loopTargets.size, 5);
  const one = state.nodes.get('One'), two = state.nodes.get('Two');
  assert.ok(Math.hypot(one.x - two.x, one.y - two.y) >= 240);
});

test('shared loop geometry is independent of trace order and cycle entry', () => {
  const first = layout([lenin, moon]).state;
  const second = layout([moon, lenin]).state;
  for (const [title, point] of first.loopTargets) {
    assert.equal(point.x, second.loopTargets.get(title).x);
    assert.equal(point.y, second.loopTargets.get(title).y);
  }
  const rotated = layout([['Two', 'B', 'C', 'A', 'B'], ['One', 'A', 'B', 'C', 'A']]).state;
  const original = layout([['One', 'A', 'B', 'C', 'A'], ['Two', 'B', 'C', 'A', 'B']]).state;
  for (const [title, point] of original.loopTargets) {
    assert.equal(point.x, rotated.loopTargets.get(title).x);
    assert.equal(point.y, rotated.loopTargets.get(title).y);
  }
});

test('separate cycles reserve space for their full approach trees', () => {
  const routes = [['One', 'A', 'B', 'C', 'A'], ['Two', 'A', 'B', 'C', 'A'], ['Three', 'D', 'E', 'F', 'D'], ['Four', 'D', 'E', 'F', 'D']];
  const { state } = layout(routes);
  const rightOfFirst = Math.max(...routes.slice(0, 2).flat().map(title => state.nodes.get(title).x));
  const leftOfSecond = Math.min(...routes.slice(2).flat().map(title => state.nodes.get(title).x));
  assert.ok(leftOfSecond - rightOfFirst >= 230);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../philosophy-graph-site/dist/app.js'), 'utf8');
const functions = source.slice(source.indexOf('  function routeCounts('), source.indexOf('  function layoutLoops('));
const context = vm.createContext({});
vm.runInContext(functions, context);

test('a shared hub grows when a second distinct route visits it', () => {
  const counts = context.routeCounts([
    { start: 'Cat', titles: ['Cat', 'Language', 'Philosophy'] },
    { start: 'Genre', titles: ['Genre', 'Language', 'Philosophy'] }
  ]);
  assert.equal(counts.get('Cat'), 1);
  assert.equal(counts.get('Language'), 2);
  assert.ok(context.nodeRadius('Language', counts.get('Language')) > context.nodeRadius('Cat', counts.get('Cat')));
});

test('loop repetitions and retracing a start count only once', () => {
  const titles = ['Moon', 'Existence', 'Reality', 'Existence'];
  const counts = context.routeCounts([{ start: 'Moon', titles }, { start: 'moon', titles }]);
  assert.equal(counts.get('Existence'), 1);
  assert.equal(counts.get('Reality'), 1);
});

test('growth is monotonic and capped, and Philosophy keeps its larger base', () => {
  for (let count = 1; count < 30; count++) {
    assert.ok(context.nodeRadius('Language', count + 1) >= context.nodeRadius('Language', count));
  }
  assert.equal(context.nodeRadius('Language', 10000), 26);
  assert.equal(context.nodeRadius('Philosophy', 10000), 35);
  assert.ok(context.nodeRadius('Philosophy', 1) > context.nodeRadius('Language', 1));
});

test('cleared routes have no accumulated counts', () => {
  assert.equal(context.routeCounts([]).size, 0);
});

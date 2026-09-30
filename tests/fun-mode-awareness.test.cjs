const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../philosophy-graph-site/dist/app.js'), 'utf8');
const fetchFunction = source.slice(source.indexOf('  async function fetchFirstLink('), source.indexOf('  function addNode('));
function client(canonicalTitle = 'Awareness') {
  let requests = 0;
  const context = vm.createContext({
    API: 'https://en.wikipedia.org/w/api.php', URL, URLSearchParams,
    state: { pageCache: new Map() },
    firstEligibleLink: () => 'Psychology',
    fetch: async () => {
      requests++;
      return { ok: true, json: async () => ({ parse: { title: canonicalTitle, text: '<p>Psychology first</p>' } }) };
    }
  });
  vm.runInContext(fetchFunction, context);
  return { fetch: (title, fun) => context.fetchFirstLink(title, fun), requests: () => requests };
}

test('Fun mode sends Awareness to Philosophy while Standard mode follows the live link', async () => {
  const wiki = client();
  assert.equal((await wiki.fetch('Awareness', true)).next, 'Philosophy');
  assert.equal((await wiki.fetch('Awareness', false)).next, 'Psychology');
  assert.equal((await wiki.fetch('Awareness', true)).next, 'Philosophy');
  assert.equal(wiki.requests(), 2, 'mode caches remain separate');
});

test('the shortcut uses the resolved article title, including redirects', async () => {
  const wiki = client();
  const result = await wiki.fetch('An Awareness redirect', true);
  assert.equal(result.title, 'Awareness');
  assert.equal(result.next, 'Philosophy');
  await wiki.fetch('Awareness', true);
  assert.equal(wiki.requests(), 1, 'canonical title reuses the resolved cache entry');
});

test('other articles still follow their parsed link in Fun mode', async () => {
  for (const title of ['Psychology', 'Awareness (disambiguation)', 'Self-awareness']) {
    const wiki = client(title);
    assert.equal((await wiki.fetch(title, true)).next, 'Psychology');
  }
});

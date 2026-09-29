(() => {
  'use strict';

  const API = 'https://en.wikipedia.org/w/api.php';
  const MAX_STEPS = 100;
  const svgNS = 'http://www.w3.org/2000/svg';
  const els = {
    form: document.getElementById('trace-form'), input: document.getElementById('article-input'), button: document.getElementById('trace-button'),
    funMode: document.getElementById('fun-mode'), ruleDescription: document.getElementById('rule-description'),
    modeInfoButton: document.getElementById('mode-info-button'), modeInfo: document.getElementById('fun-mode-info'), modeHint: document.getElementById('mode-hint'),
    status: document.getElementById('status'), canvas: document.getElementById('canvas-wrap'), svg: document.getElementById('graph'),
    viewport: document.getElementById('viewport'), edges: document.getElementById('edges'), nodes: document.getElementById('nodes'),
    list: document.getElementById('path-list'), detailTitle: document.getElementById('detail-title'), detailDescription: document.getElementById('detail-description'),
    detailLink: document.getElementById('detail-link'), detailSymbol: document.querySelector('.detail-symbol'),
    nodeCount: document.getElementById('node-count'), pathCount: document.getElementById('path-count'), stepCount: document.getElementById('step-count')
  };
  const colors = ['#d6f878', '#83d8d1', '#c9a9ff', '#8bb7ff'];
  const LOOP_COLOR = '#ff9b70';
  const state = { nodes: new Map(), edges: new Map(), paths: [], pageCache: new Map(), loopTargets: new Map(), cycleEdges: new Map(), includeParentheses: els.funMode.checked, selected: 'Philosophy', activePath: null, busy: false, scale: 1, tx: 0, ty: 0, pointer: null, raf: 0, frames: 0 };

  function setStatus(message, error = false) {
    els.status.textContent = message;
    els.canvas.querySelector('.canvas-note').classList.toggle('error', error);
  }
  function cleanTitle(value) {
    let title = value.trim();
    if (/^https?:\/\//i.test(title)) {
      const url = new URL(title);
      if (url.hostname !== 'en.wikipedia.org' && url.hostname !== 'www.en.wikipedia.org') throw new Error('Use an English Wikipedia article URL.');
      if (url.pathname.startsWith('/wiki/')) title = decodeURIComponent(url.pathname.slice(6));
      else if (url.pathname === '/w/index.php') title = url.searchParams.get('title') || '';
      else throw new Error('This URL does not point to a Wikipedia article.');
    }
    title = title.replace(/_/g, ' ').replace(/#.*$/, '').trim();
    if (!title) throw new Error('Enter an article title or Wikipedia URL.');
    if (title.includes(':')) throw new Error('Please choose an encyclopedia article, not a Wikipedia special page.');
    return title;
  }
  function wikiURL(title) { return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')); }
  function targetFromHref(href) {
    if (!href || href.startsWith('#')) return null;
    let raw;
    if (href.startsWith('./')) raw = href.slice(2);
    else if (href.startsWith('/wiki/')) raw = href.slice(6);
    else if (href.startsWith('https://en.wikipedia.org/wiki/')) raw = href.slice(30);
    else return null;
    try {
      const title = decodeURIComponent(raw.split('#')[0].split('?')[0]).replace(/_/g, ' ').trim();
      return title && !title.includes(':') ? title : null;
    } catch { return null; }
  }
  function isExcluded(element) {
    return element.closest('table, .hatnote, .infobox, .sidebar, .ambox, .thumb, .mw-empty-elt, .reflist, .navbox, .shortdescription, .metadata, .mw-heading, .reference, sup, figure, aside, blockquote') !== null;
  }
  function firstEligibleLink(html, includeParentheses = false) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('.mw-parser-output') || doc.body;
    const blocks = [...root.querySelectorAll('p, li')].filter(block => !isExcluded(block));
    for (const block of blocks) {
      let depth = 0;
      let found = null;
      function visit(node, italic = false) {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
          for (const char of node.nodeValue) {
            if (char === '(' || char === '（') depth++;
            else if (char === ')' || char === '）') depth = Math.max(0, depth - 1);
          }
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node;
        if (el !== block && (el.matches('sup,style,script') || isExcluded(el))) return;
        const inItalic = italic || el.matches('i,em');
        if (el.tagName === 'A') {
          const target = targetFromHref(el.getAttribute('href'));
          if (target && !inItalic && (includeParentheses || !depth) && !el.classList.contains('new')) { found = target; return; }
        }
        for (const child of el.childNodes) visit(child, inItalic);
      }
      visit(block);
      if (found) return found;
    }
    return null;
  }
  async function fetchFirstLink(title, includeParentheses) {
    const mode = includeParentheses ? 'fun' : 'standard';
    const key = `${mode}:${title.toLowerCase()}`;
    if (state.pageCache.has(key)) return state.pageCache.get(key);
    const url = new URL(API);
    url.search = new URLSearchParams({ action: 'parse', page: title, prop: 'text', format: 'json', formatversion: '2', redirects: '1', origin: '*' });
    let response;
    try { response = await fetch(url, { headers: { 'Api-User-Agent': 'PathsToPhilosophy/1.0 (interactive educational visualization)' } }); }
    catch { throw new Error('Wikipedia could not be reached. Check your connection and try again.'); }
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}. Please try again shortly.`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || 'Wikipedia could not find that page.');
    if (!data.parse || typeof data.parse.text !== 'string') throw new Error('Wikipedia did not return article text.');
    const result = { title: data.parse.title, next: firstEligibleLink(data.parse.text, includeParentheses) };
    state.pageCache.set(key, result);
    state.pageCache.set(`${mode}:${result.title.toLowerCase()}`, result);
    return result;
  }
  function addNode(title, near) {
    if (state.nodes.has(title)) return state.nodes.get(title);
    const offset = state.nodes.size;
    const node = { title, x: near ? near.x - 90 + (Math.random() - .5) * 75 : (Math.random() - .5) * 180,
      y: near ? near.y + (Math.random() - .5) * 110 : (Math.random() - .5) * 190 + offset * 2, vx: 0, vy: 0 };
    if (title === 'Philosophy') { node.x = 0; node.y = 0; }
    state.nodes.set(title, node);
    return node;
  }
  function addEdge(from, to) { const key = `${from}\u0000${to}`; if (!state.edges.has(key)) state.edges.set(key, { from, to }); }
  function pathEdgeKeys(path) { return path.titles.slice(1).map((title, i) => `${path.titles[i]}\u0000${title}`); }
  function layoutLoops() {
    state.loopTargets.clear(); state.cycleEdges.clear();
    const cycles = new Map();
    let right = 180;
    for (const path of state.paths.filter(path => path.outcome === 'loop')) {
      const last = path.titles.at(-1);
      const entry = path.titles.findIndex(title => title.toLowerCase() === last.toLowerCase());
      const titles = path.titles.slice(entry, -1);
      if (!titles.length) continue;
      const key = titles.map(title => title.toLowerCase()).sort().join('\u0000');
      let cycle = cycles.get(key);
      if (!cycle) {
        const radius = Math.max(90, titles.length * 135 / (2 * Math.PI));
        cycle = { x: right + radius, y: 0, radius };
        right += radius * 2 + 230;
        cycles.set(key, cycle);
        titles.forEach((title, i) => {
          const angle = -Math.PI / 2 + i * 2 * Math.PI / titles.length;
          state.loopTargets.set(title, { x: cycle.x + radius * Math.cos(angle), y: cycle.y + radius * Math.sin(angle) });
          const next = titles[(i + 1) % titles.length];
          state.cycleEdges.set(`${title}\u0000${next}`, { ...cycle, start: angle, end: angle + 2 * Math.PI / titles.length });
        });
      }
      // Keep the approach outside the ring; repeated routes share the same cycle.
      const entryTarget = state.loopTargets.get(titles[0]);
      const dx = (entryTarget.x - cycle.x) / cycle.radius, dy = (entryTarget.y - cycle.y) / cycle.radius;
      for (let i = entry - 1; i >= 0; i--) {
        const title = path.titles[i];
        if (!state.loopTargets.has(title)) {
          const distance = (entry - i) * 115;
          state.loopTargets.set(title, { x: entryTarget.x + dx * distance, y: entryTarget.y + dy * distance });
        }
      }
    }
    for (const [title, target] of state.loopTargets) {
      const node = state.nodes.get(title);
      if (node) { node.x = target.x; node.y = target.y; node.vx = 0; node.vy = 0; }
    }
  }
  function cycleArc(cycle) {
    const gap = 15 / cycle.radius;
    const start = cycle.start + gap, end = cycle.end - gap;
    const x1 = cycle.x + cycle.radius * Math.cos(start), y1 = cycle.y + cycle.radius * Math.sin(start);
    const x2 = cycle.x + cycle.radius * Math.cos(end), y2 = cycle.y + cycle.radius * Math.sin(end);
    return `M ${x1} ${y1} A ${cycle.radius} ${cycle.radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
  }
  function outcomeText(path) {
    if (path.sample) return `Example snapshot · ${path.outcome === 'loop' ? 'Loop · ' : ''}${path.titles.length - 1} links`;
    if (path.outcome === 'reached') return `Reached Philosophy · ${path.titles.length - 1} links`;
    if (path.outcome === 'loop') return `Loop detected · ${path.titles.length - 1} links`;
    if (path.outcome === 'dead') return `No eligible link · ${path.titles.length - 1} links`;
    if (path.outcome === 'limit') return `Stopped at ${MAX_STEPS} links`;
    if (path.outcome === 'error') return path.error;
    return `Tracing · ${path.titles.length - 1} links`;
  }
  function updateList() {
    els.list.replaceChildren();
    if (!state.paths.length) { const p = document.createElement('p'); p.className = 'empty-list'; p.textContent = 'Your traced routes will appear here.'; els.list.append(p); return; }
    [...state.paths].reverse().forEach(path => {
      const loop = path.outcome === 'loop';
      const card = document.createElement('div'); card.className = 'path-card' + (state.activePath === path ? ' active' : '') + (loop ? ' loop' : '');
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `Highlight path from ${path.start}`);
      const dot = document.createElement('span'); dot.className = 'path-dot'; dot.style.background = loop ? LOOP_COLOR : path.color;
      const title = document.createElement('span'); title.className = 'path-title'; title.textContent = path.start;
      const steps = document.createElement('span'); steps.className = 'path-steps'; steps.textContent = String(path.titles.length - 1).padStart(2, '0');
      button.append(dot, title, steps); button.addEventListener('click', () => { state.activePath = state.activePath === path ? null : path; render(); });
      const outcome = document.createElement('div'); outcome.className = 'path-outcome'; outcome.textContent = outcomeText(path);
      card.append(button, outcome); els.list.append(card);
    });
  }
  function selectNode(title) {
    state.selected = title;
    els.detailTitle.textContent = title;
    els.detailSymbol.textContent = title === 'Philosophy' ? 'Φ' : title.slice(0, 1).toUpperCase();
    els.detailLink.href = wikiURL(title);
    const next = [...state.edges.values()].find(e => e.from === title)?.to;
    els.detailDescription.textContent = title === 'Philosophy' ? 'The destination at the heart of the experiment.' : next ? `Its first eligible link leads to ${next}.` : 'Open this article on Wikipedia to explore further.';
    renderGraph();
  }
  function element(name, attrs = {}) { const el = document.createElementNS(svgNS, name); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); return el; }
  function renderGraph() {
    els.edges.replaceChildren(); els.nodes.replaceChildren();
    const active = state.activePath;
    const activeEdges = new Set(active ? pathEdgeKeys(active) : []);
    const activeNodes = new Set(active ? active.titles : []);
    const loopPaths = state.paths.filter(path => path.outcome === 'loop');
    const loopEdges = new Set(loopPaths.flatMap(pathEdgeKeys));
    const loopNodes = new Set(loopPaths.flatMap(path => path.titles));
    for (const edge of state.edges.values()) {
      const from = state.nodes.get(edge.from), to = state.nodes.get(edge.to);
      if (!from || !to) continue;
      const key = `${edge.from}\u0000${edge.to}`;
      const cycle = state.cycleEdges.get(key);
      const attrs = { class: 'edge' + (activeEdges.has(key) ? ' active' : '') + (loopEdges.has(key) ? ' loop' : '') + (cycle ? ' cycle' : '') };
      const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
      const inset = loopEdges.has(key) ? 14 / length : 0;
      const line = cycle ? element('path', { ...attrs, d: cycleArc(cycle) }) : element('line', { ...attrs, x1: from.x, y1: from.y, x2: to.x - (to.x - from.x) * inset, y2: to.y - (to.y - from.y) * inset });
      els.edges.append(line);
    }
    for (const node of state.nodes.values()) {
      const root = node.title === 'Philosophy';
      const g = element('g', { class: `node${root ? ' root' : ''}${activeNodes.has(node.title) ? ' active' : ''}${loopNodes.has(node.title) ? ' loop' : ''}${state.selected === node.title ? ' selected' : ''}`, transform: `translate(${node.x} ${node.y})`, tabindex: '0', role: 'button', 'aria-label': `Select ${node.title}` });
      const circle = element('circle', { r: root ? '19' : '10' });
      const label = element('text', { x: root ? '0' : '0', y: root ? '-31' : '-19', 'text-anchor': 'middle' }); label.textContent = node.title;
      if (root) { const phi = element('text', { x: '0', y: '10', 'text-anchor': 'middle', style: 'fill:#17261c;stroke:none;font:29px Georgia,serif' }); phi.textContent = 'Φ'; g.append(circle, phi, label); }
      else g.append(circle, label);
      g.addEventListener('click', event => { event.stopPropagation(); selectNode(node.title); });
      g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.title); } });
      els.nodes.append(g);
    }
    transform();
  }
  function render() {
    updateList(); renderGraph();
    els.nodeCount.textContent = String(state.nodes.size);
    els.pathCount.textContent = String(state.paths.length);
    els.stepCount.textContent = String(state.edges.size);
    if (state.selected && !state.nodes.has(state.selected)) selectNode('Philosophy');
  }
  function transform() { els.viewport.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`); }
  function fitGraph() {
    const rect = els.svg.getBoundingClientRect();
    const nodes = [...state.nodes.values()];
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    for (const cycle of state.cycleEdges.values()) {
      xs.push(cycle.x - cycle.radius, cycle.x + cycle.radius);
      ys.push(cycle.y - cycle.radius, cycle.y + cycle.radius);
    }
    const minX = Math.min(...xs) - 105, maxX = Math.max(...xs) + 105, minY = Math.min(...ys) - 80, maxY = Math.max(...ys) + 80;
    state.scale = Math.max(.2, Math.min(1.5, Math.min((rect.width - 75) / (maxX - minX), (rect.height - 100) / (maxY - minY))));
    state.tx = rect.width / 2 - ((minX + maxX) / 2) * state.scale;
    state.ty = rect.height / 2 - ((minY + maxY) / 2) * state.scale;
    transform();
  }
  function simulate() {
    state.frames++;
    const nodes = [...state.nodes.values()];
    const forces = new Map(nodes.map(n => [n.title, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y;
      const dist2 = dx * dx + dy * dy + 100, force = Math.min(2.4, 4500 / dist2), dist = Math.sqrt(dist2);
      forces.get(a.title).x += dx / dist * force; forces.get(a.title).y += dy / dist * force;
      forces.get(b.title).x -= dx / dist * force; forces.get(b.title).y -= dy / dist * force;
    }
    for (const edge of state.edges.values()) {
      const a = state.nodes.get(edge.from), b = state.nodes.get(edge.to); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.max(1, Math.hypot(dx, dy)), force = (dist - 115) * .012;
      forces.get(a.title).x += dx / dist * force; forces.get(a.title).y += dy / dist * force;
      forces.get(b.title).x -= dx / dist * force; forces.get(b.title).y -= dy / dist * force;
    }
    for (const node of nodes) {
      if (node.title === 'Philosophy' || state.loopTargets.has(node.title)) continue;
      const force = forces.get(node.title);
      node.vx = (node.vx + force.x - node.x * .0005) * .82;
      node.vy = (node.vy + force.y - node.y * .0005) * .82;
      node.x += Math.max(-15, Math.min(15, node.vx)); node.y += Math.max(-15, Math.min(15, node.vy));
    }
    renderGraph();
    if (state.frames < 100) state.raf = requestAnimationFrame(simulate); else state.raf = 0;
  }
  function kick() { state.frames = 0; if (!state.raf) state.raf = requestAnimationFrame(simulate); }
  async function trace(raw) {
    if (state.busy) throw new Error('A path is already being traced.');
    const start = cleanTitle(raw);
    const includeParentheses = state.includeParentheses;
    if (state.paths.some(path => path.sample)) resetGraph();
    state.busy = true; els.button.disabled = true; els.funMode.disabled = true;
    const path = { start, titles: [], outcome: 'tracing', color: colors[state.paths.length % colors.length], error: '' };
    state.paths.push(path); state.activePath = path;
    let current = start;
    let previous = null;
    const visited = new Set();
    try {
      for (let step = 0; step <= MAX_STEPS; step++) {
        setStatus(`Reading ${current} · step ${step + 1}`);
        const page = await fetchFirstLink(current, includeParentheses);
        current = page.title;
        if (step === 0) path.start = current;
        if (previous) addEdge(previous, current);
        if (visited.has(current.toLowerCase())) { path.titles.push(current); path.outcome = 'loop'; render(); kick(); break; }
        visited.add(current.toLowerCase());
        addNode(current, previous ? state.nodes.get(previous) : state.nodes.get('Philosophy'));
        path.titles.push(current);
        render(); kick();
        if (current.toLowerCase() === 'philosophy') { path.outcome = 'reached'; break; }
        if (!page.next) { path.outcome = 'dead'; break; }
        const next = page.next;
        if (next.toLowerCase() === 'philosophy') { addEdge(current, 'Philosophy'); path.titles.push('Philosophy'); path.outcome = 'reached'; render(); kick(); break; }
        if (step === MAX_STEPS) { path.outcome = 'limit'; break; }
        previous = current;
        current = next;
      }
    } catch (error) { path.outcome = 'error'; path.error = error.message || 'Could not finish this path.'; }
    finally {
      state.busy = false; els.button.disabled = false; els.funMode.disabled = false; layoutLoops(); render(); kick();
      const summary = outcomeText(path);
      setStatus(`${path.start}: ${summary}`, path.outcome === 'error');
      if (path.titles.length) { selectNode(path.titles[0]); fitGraph(); }
      else { state.paths = state.paths.filter(p => p !== path); state.activePath = null; render(); }
    }
    return { start: path.start, mode: includeParentheses ? 'fun' : 'standard', path: path.titles, outcome: path.outcome, message: outcomeText(path) };
  }
  function resetGraph() {
    state.nodes.clear(); state.edges.clear(); state.paths = []; state.activePath = null;
    state.loopTargets.clear(); state.cycleEdges.clear();
    addNode('Philosophy'); selectNode('Philosophy'); render(); fitGraph();
  }
  els.form.addEventListener('submit', event => { event.preventDefault(); trace(els.input.value).catch(error => setStatus(error.message, true)); });
  els.funMode.addEventListener('change', () => {
    state.includeParentheses = els.funMode.checked;
    els.ruleDescription.textContent = state.includeParentheses
      ? 'Follow the first eligible link, including links in parentheses. Watch the route unfold, merge, loop, or stop.'
      : 'Follow the first eligible link, skipping links in parentheses and italics. Watch the route unfold, merge, loop, or stop.';
    els.modeHint.textContent = state.includeParentheses ? 'Include parentheses' : 'Original rule';
    resetGraph();
    setStatus(`${state.includeParentheses ? 'Fun' : 'Standard'} mode selected. Choose an article to begin.`);
  });
  function closeModeInfo() { els.modeInfo.hidden = true; els.modeInfoButton.setAttribute('aria-expanded', 'false'); }
  els.modeInfoButton.addEventListener('click', () => {
    els.modeInfo.hidden = !els.modeInfo.hidden;
    els.modeInfoButton.setAttribute('aria-expanded', String(!els.modeInfo.hidden));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModeInfo(); });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { els.input.value = button.dataset.example; trace(button.dataset.example).catch(error => setStatus(error.message, true)); }));
  document.getElementById('clear-button').addEventListener('click', () => { if (state.busy) return; resetGraph(); setStatus('Graph cleared. Choose an article to begin.'); });
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(.8));
  document.getElementById('fit').addEventListener('click', fitGraph);
  function zoom(factor, x = els.svg.clientWidth / 2, y = els.svg.clientHeight / 2) {
    const next = Math.max(.15, Math.min(4, state.scale * factor));
    state.tx = x - (x - state.tx) * next / state.scale; state.ty = y - (y - state.ty) * next / state.scale; state.scale = next; transform();
  }
  els.svg.addEventListener('wheel', event => { event.preventDefault(); const rect = els.svg.getBoundingClientRect(); zoom(event.deltaY < 0 ? 1.12 : .89, event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
  els.svg.addEventListener('pointerdown', event => { if (event.target.closest('.node')) return; state.pointer = { x: event.clientX, y: event.clientY, tx: state.tx, ty: state.ty }; els.svg.classList.add('dragging'); els.svg.setPointerCapture(event.pointerId); });
  els.svg.addEventListener('pointermove', event => { if (!state.pointer) return; state.tx = state.pointer.tx + event.clientX - state.pointer.x; state.ty = state.pointer.ty + event.clientY - state.pointer.y; transform(); });
  function stopPan() { state.pointer = null; els.svg.classList.remove('dragging'); }
  els.svg.addEventListener('pointerup', stopPan); els.svg.addEventListener('pointercancel', stopPan);
  window.addEventListener('resize', () => { if (state.nodes.size === 1) fitGraph(); });

  if (document.modelContext?.registerTool) {
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'trace_wikipedia_path', title: 'Trace a Wikipedia path',
        description: 'Follow the first eligible link from an English Wikipedia article using the selected Fun mode setting, and add the route to the visible graph.',
        inputSchema: { type: 'object', properties: { article: { type: 'string', description: 'English Wikipedia article title or URL' } }, required: ['article'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) { if (!input || typeof input.article !== 'string') throw new Error('article must be a string'); els.input.value = input.article; return await trace(input.article); }
      })).catch(() => {});
    } catch {}
  }
  addNode('Philosophy');
  const examples = [
    { start: 'Cat', titles: ['Cat', 'Carnivore', 'Latin', 'Classical language', 'Language', 'Communication', 'Information', 'Abstract and concrete', 'Philosophy'], outcome: 'reached', color: colors[0], sample: true },
    { start: 'Moon', titles: ['Moon', 'Natural satellite', 'Astronomical object', 'Universe', 'Existence', 'Reality', 'Existence'], outcome: 'loop', color: colors[1], sample: true }
  ];
  for (const path of examples) {
    state.paths.push(path);
    for (let i = path.titles.length - 1; i >= 0; i--) {
      const title = path.titles[i]; addNode(title, state.nodes.get(path.titles[i + 1]) || state.nodes.get('Philosophy'));
      if (i < path.titles.length - 1) addEdge(title, path.titles[i + 1]);
    }
  }
  layoutLoops(); render(); kick(); requestAnimationFrame(fitGraph);
  setStatus('Example paths from 29 September 2026. Trace an article for live results.');
})();

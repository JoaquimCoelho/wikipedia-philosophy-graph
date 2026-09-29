# Paths to Philosophy

An interactive graph for exploring the [Wikipedia first-link phenomenon](https://en.wikipedia.org/wiki/Wikipedia:Getting_to_Philosophy). Enter any English Wikipedia article title or URL; the app fetches its current rendered article through the MediaWiki Action API, finds the first eligible article link in the main text, and repeats until it reaches Philosophy, encounters a loop, runs out of links, or reaches a 100-step safety limit.

The graph supports zooming, panning, node selection, and highlighting a route. Two dated example routes give the page a useful starting view; the first live trace replaces those examples. Results can change as Wikipedia pages are edited. The often quoted 97% figure describes a 2016 snapshot, not a guarantee for today's pages.

## Run locally

The site is plain HTML, CSS, and JavaScript. Serve `philosophy-graph-site/dist` with any static file server, for example:

```sh
cd philosophy-graph-site/dist
python -m http.server 8000
```

Then open `http://localhost:8000`. A network connection is needed to query English Wikipedia. No API key is required.

## How links are chosen

The parser reads rendered article paragraphs in order. It skips navigation boxes, infoboxes, hatnotes, references, links inside parentheses, italicized links, and non-article namespaces. Wikipedia markup is complex, so unusual pages may yield a different first link than a human reader expects. Redirects are resolved by the API before adding nodes to the graph.

The code for the deployable static site is in [`philosophy-graph-site/dist`](philosophy-graph-site/dist). The `.openai/hosting.json` file configures its Sites deployment.

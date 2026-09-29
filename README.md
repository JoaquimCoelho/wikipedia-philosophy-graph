# Paths to Philosophy

[Open the hosted site](https://joaquimcoelho.github.io/wikipedia-philosophy-graph/).

An interactive graph for exploring the [Wikipedia first-link phenomenon](https://en.wikipedia.org/wiki/Wikipedia:Getting_to_Philosophy). Enter any English Wikipedia article title or URL; the app fetches its current rendered article through the MediaWiki Action API, finds the first eligible article link in the main text, and repeats until it reaches Philosophy, encounters a loop, runs out of links, or reaches a 100-step safety limit.

The graph supports zooming, panning, node selection, and highlighting a route. Loop routes stay coral even when another route is selected, and their cycles are arranged as circular rings with directional arcs (including two-page and self loops). Two dated example routes give the page a useful starting view; the first live trace replaces those examples. Results can change as Wikipedia pages are edited.

Node size shows how many distinct starting articles' routes pass through that page. Loop repetitions and retracing the same starting article do not inflate the count. Growth is capped, and hovering over a node shows its route count. Clearing the graph or changing mode resets the counts.

## Run locally

The site is plain HTML, CSS, and JavaScript. Serve `philosophy-graph-site/dist` with any static file server, for example:

```sh
cd philosophy-graph-site/dist
python -m http.server 8000
```

Then open `http://localhost:8000`. A network connection is needed to query English Wikipedia. No API key is required.

## How links are chosen

The parser reads rendered article paragraphs and list items in order, so list-based pages such as disambiguation pages can also be traced. **Fun mode is selected by default** and includes links inside parentheses, which can make reaching Philosophy more likely. Uncheck it to use the original Wikipedia rule and skip parenthetical links. Both modes skip navigation boxes, infoboxes, hatnotes, references, italicized links, and non-article namespaces. The info button beside the checkbox explains the difference. Changing mode clears the graph to avoid mixing rules, and cached links are kept separate for each mode. Wikipedia markup is complex, so unusual pages may yield a different first link than a human reader expects. Redirects are resolved by the API before adding nodes to the graph.

The code for the deployable static site is in [`philosophy-graph-site/dist`](philosophy-graph-site/dist). GitHub Actions deploys this directory to GitHub Pages on every push to `main`.

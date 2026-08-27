## Search

**What it is:** The inline search box in the navbar — find a channel or token by name without navigating to a dedicated search page.

**How it works:** A debounced client-side query (in `navbar.tsx`, via the exported `SearchBox` sub-component, also reused standalone as `search-bar.tsx`) that queries channels and tokens together and shows results inline, rather than routing to a separate results page.

# Source tiers

Prefer T1 API-backed sources. Record per-source failures and continue with the others.

- T1: OpenAlex, arXiv, Crossref, Semantic Scholar with API key.
- T2: Semantic Scholar without key (shared anonymous pool, rate limited).
- T3: scraped sources, only as last resort and with an explicit warning.

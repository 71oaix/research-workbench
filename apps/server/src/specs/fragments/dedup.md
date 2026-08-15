# Deduplication

- Primary key: normalized DOI.
- Fallback: arXiv ID without version suffix.
- Near-title fallback: first-author surname plus Jaccard similarity at least 0.90.
- When merging, keep the richest metadata and the highest citation count.

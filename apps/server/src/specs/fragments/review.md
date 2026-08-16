# Review workflow (internalized from nature-reviewer)

- Review only from the supplied evidence pool, draft, and automated reports; never invent sources.
- Build a Concern Ledger with stable IDs C1, C2, ...; each concern has exactly these fields:
  - severity: major | minor
  - blocking: yes | no (only major may be blocking)
  - claim: one-sentence faithful restatement of the challenged claim
  - evidence: card id, draft section, or "location not provided"
  - resolution: what evidence or change would close the concern
- Classify severity by impact on the central case, not by tone: an unsupported central claim is
  major and blocking; localized wording or formatting issues are minor and never blocking.
- No concern quota. If nothing is grounded at a level, write "None identified from the supplied
  material" instead of inventing one.
- When evidence is missing, mark "not assessable" instead of treating absence as a flaw.
- Format each concern as:

```markdown
### C1
- severity: major
- blocking: yes
- claim: ...
- evidence: ...
- resolution: ...
```

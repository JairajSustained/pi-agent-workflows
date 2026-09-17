---
name: deep-research-pi
description: Cross-checked research via a dynamic workflow. Use when a question needs many sources compared against each other with adversarial verification, ending in a cited report. Fans out searches, fetches sources, verifies every claim, and filters what does not survive.
---

# Deep Research (pi-workflows)

Run cross-checked research as a dynamic workflow. Do not answer from a single
pass: fan out, verify adversarially, then synthesize.

## When to use

The question has many independent sub-questions, needs sources compared
against each other, or a wrong answer is costly. Skip for simple lookups.

## Procedure

1. Ask the user for (or infer) `args`: `{ question, angles?, depth? }`.
   `angles` defaults to 3–5 search angles you derive from the question.
2. Call the `workflow` tool with `size: "medium"` and a script shaped like
   the template below. Adapt prompts to the question; keep the structure:
   **fan-out → verify → skeptic → report**.
3. Label every agent deterministically (`search-<angle>`, `verify-<n>`,
   `skeptic-<n>`) so a failed run can resume with `resumeFrom`.
4. Require `schema: "json"` for verify/skeptic outputs so the report stage
   can parse them reliably.

## Script template (adapt, do not run verbatim)

```js
const meta = {
  name: 'deep-research',
  description: 'Cross-checked research with adversarial verification',
  phases: [{ title: 'Search' }, { title: 'Verify' }, { title: 'Report' }],
};

phase('Search');
const findings = await parallel(
  args.angles.map((angle) => () =>
    agent(
      `Research this angle thoroughly, using web search and fetching primary sources. ` +
      `Return JSON: { angle, claims: [{ text, source, url }] }. Angle: ${angle}\n\nQuestion: ${args.question}`,
      { label: `search-${angle}`, phase: 'Search', schema: 'json' },
    ),
  ),
);

phase('Verify');
const allClaims = findings.flatMap((f) => JSON.parse(f.output).claims);
const verdicts = await parallel(
  allClaims.map((claim, i) => () =>
    agent(
      `Verify this claim against primary sources (search fresh, do not trust the citation given). ` +
      `Return JSON: { claim, verdict: 'confirmed'|'contradicted'|'unverifiable', evidence }. ` +
      `Claim: ${claim.text} (cited: ${claim.url})`,
      { label: `verify-${i}`, phase: 'Verify', schema: 'json' },
    ),
  ),
);
const challenged = await parallel(
  verdicts.map((v, i) => () =>
    agent(
      `Try to refute this verification. Re-read the cited evidence and look for gaps, ` +
      `misquotes, or subtle mismatches. Return JSON: { verdict, refutation? }. Verification: ${v.output}`,
      { label: `skeptic-${i}`, phase: 'Verify', schema: 'json' },
    ),
  ),
);

phase('Report');
const report = await agent(
  `Compile a cited markdown report from these verified findings. ` +
  `Include only claims with verdict 'confirmed'; list contradicted/unverifiable ones in a separate section. ` +
  `Findings: ${JSON.stringify({ verdicts: verdicts.map((v) => v.output), challenged: challenged.map((c) => c.output) })}`,
  { label: 'report', phase: 'Report' },
);
return report.output;
```

## Cost guidance

Tell the user up front: this fans out to roughly
`angles + 2 × claims + 1` agents. For a cheap first pass, run with 2 angles
and a narrow question, then widen.

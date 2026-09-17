/**
 * Starter workflow: fact-check a document claim by claim.
 *
 * Copy to `.pi/workflows/fact-check.js`, then run with:
 *   args = { draft: "<text to check>", claims?: ["<pre-extracted claim>"] }
 *
 * Shape: extract (or take given) claims → one verifier per claim in a clean
 * context → one skeptic per confirmation → compiled go/no-go report.
 */

const meta = {
  name: "fact-check",
  description: "Claim-by-claim fact check with adversarial review",
  phases: [{ title: "Extract" }, { title: "Verify" }, { title: "Report" }],
};

phase("Extract");
const claims =
  args.claims ??
  JSON.parse(
    (
      await agent(
        `Extract every factual claim from the draft below as a JSON array of strings. ` +
          `Be thorough; split compound sentences. Draft:\n${args.draft}`,
        { label: "extract", phase: "Extract", schema: "json" },
      )
    ).output,
  );

phase("Verify");
const verdicts = await parallel(
  claims.map((claim, i) => () =>
    agent(
      `Verify this claim from primary sources. Return JSON: ` +
        `{ claim, verdict: 'confirmed'|'contradicted'|'unverifiable', evidence, source }. ` +
        `Quote the exact lines you relied on. Claim: ${claim}`,
      { label: `verify-${i}`, phase: "Verify", schema: "json" },
    ),
  ),
);
const skeptics = await parallel(
  verdicts.map((v, i) => () =>
    agent(
      `Re-read the cited source and try to refute this 'confirmed' verdict. If the ` +
        `citation does not actually support the claim, flip it to 'contradicted'. ` +
        `Return JSON: { verdict, refutation? }. Verdict: ${v.output}`,
      { label: `skeptic-${i}`, phase: "Verify", schema: "json" },
    ),
  ),
);

phase("Report");
const final = verdicts.map((v, i) => {
  const base = JSON.parse(v.output);
  const check = JSON.parse(skeptics[i].output);
  return { ...base, verdict: check.verdict ?? base.verdict, refutation: check.refutation };
});
const report = await agent(
  `Compile a markdown fact-check report: a table of every claim with verdict and ` +
    `evidence, then a summary of what must be fixed before release. ` +
    `Verdicts: ${JSON.stringify(final)}`,
  { label: "report", phase: "Report" },
);
return report.output;

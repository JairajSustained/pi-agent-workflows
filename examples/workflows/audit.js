/**
 * Starter workflow: codebase audit with adversarial verification.
 *
 * Copy to `.pi/workflows/audit.js` (project) or `~/.pi/agent/workflows/audit.js`
 * (personal), then run via `/workflow-audit` or ask the model to run it with:
 *   args = { scope: "auth module", focus: ["injection", "auth bypass", ...] }
 *
 * Shape: fan-out scanners per focus area → independent skeptic per finding →
 * single synthesized report. Only findings that survive refutation are reported.
 */

const meta = {
  name: "audit",
  description: "Security/correctness audit with adversarial verification",
  phases: [{ title: "Scan" }, { title: "Challenge" }, { title: "Report" }],
};

phase("Scan");
const scans = await parallel(
  args.focus.map((area) => () =>
    agent(
      `Audit the ${args.scope} for: ${area}. Read the code, trace data flow, and list ` +
        `concrete findings as JSON: { area, findings: [{ file, lines, issue, severity }] }. ` +
        `No finding counts as a finding — return an empty list rather than stretching.`,
      { label: `scan-${area}`, phase: "Scan", schema: "json" },
    ),
  ),
);

phase("Challenge");
const findings = scans.flatMap((s, i) => {
  const parsed = JSON.parse(s.output);
  return parsed.findings.map((f, j) => ({ ...f, scan: i, idx: j }));
});
const challenges = await parallel(
  findings.map((f) => () =>
    agent(
      `Attempt to refute this audit finding by re-reading the cited code. Check: is the ` +
        `sink reachable, are guards/sanitizers missed, is the severity justified? ` +
        `Return JSON: { upheld: true|false, reason }. Finding: ${JSON.stringify(f)}`,
      { label: `challenge-${f.scan}-${f.idx}`, phase: "Challenge", schema: "json" },
    ),
  ),
);

phase("Report");
const upheld = findings.filter((_, i) => JSON.parse(challenges[i].output).upheld);
const report = await agent(
  `Write a markdown audit report for ${args.scope}: prioritized findings with file/line ` +
    `evidence, then a section noting ${findings.length - upheld.length} refuted (dropped) ` +
    `claim(s). Findings: ${JSON.stringify(upheld)}`,
  { label: "report", phase: "Report" },
);
return report.output;

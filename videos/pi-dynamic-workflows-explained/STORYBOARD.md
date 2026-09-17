---
format: 1920x1080
duration: 90s
music: none
message: "Dynamic workflows move the plan out of the model's context and into a script, so one session can run dozens of agents without drowning."
arc: concept-explainer with process
audience: developers who build with LLM coding agents
mode: collaborative
---

> **Silent video.** The user chose a fully silent cut (no narration, no BGM, no
> SFX) — the canonical marker (`music: none` + no `SCRIPT.md`) applies. Every
> frame therefore carries its teaching in **on-screen copy + motion**, and the
> `copy:` lines below are the script: each `·` marks a reveal cue the shot paces to.

## Video direction

- **Palette (from `frame.md`, by role)** — cream paper is the default ground and carries the argument (1–3, 8–11); navy is the mechanism ground and holds one continuous stage across 4–7. Ink is type; **coral is scarce voltage — at most one element per frame** (the questioned phrase, the highlighted call, the barrier, the resolved number, the ✱). Teal/amber appear only inside code surfaces.
- **Type by role** — display = EB Garamond (claims and landings), body = Inter, mono = JetBrains Mono (code, labels, numbers, chrome). Numerals tabular wherever a value counts.
- **Motion grammar** — long-tail eases (`power3`) only; nothing bounces, nothing overshoots. Entrances are *put*, not thrown: 0.4–0.7s, stagger ≤ 0.12s.
- **Reveal model (silent cut)** — there is no voice, so each frame paces its reveals to the **reading beat of its `copy:` cues**: every `·` is a cue landing 1.2–2.4s apart. Front-loading is banned; the last cue resolves into a held read.
- **Held / breather frames** — 3 (the held line before the mechanism starts), 8 (the half-second stop after a finding dies), 11 (the closing line holds to the last frame). 4–7 keep content arriving throughout; 9–10 slow the pulse after the turn.
- **Camera discipline** — no push/pan in a frame's back half. The only "travel" is 5 and 7's edge-draws. No lazy breathing, no idle drift.
- **Negative list** — no glows except a single coral emphasis bloom; no glitch/scanline/CRT decoration (the subject is code, not retro); no stock imagery, fake cursors, or browser chrome; no caption pill (silent cut); no `<audio>` element anywhere. Both motion failure modes are banned: **slideshow** (front-load then freeze) and **screensaver** (everything drifting independently).
- **Registry blocks are mechanisms, not styles** — where a frame names a block (`code-typing`, `svg-stroke-trace`, `count-up`, `mk-progress-stat`, `code-terminal-run`, `success-check`), the *mechanism* is why it is there; restyle it entirely to `frame.md` tokens. A block never imports its own palette, font, or chrome.

## Frame 1 — No room

- scene: Two lines of huge EB Garamond on bare cream; line one states the limit, line two turns it into a question — `all the work?` lands in coral. A mono footer line lists the loop: one head · turn by turn · everything lands back in it.
- copy: "Your agent has a limited context window." · "So why make it do all the work?"
- duration: 6s
- poster: 4s
- transition_in: cut
- status: animated
- src: compositions/frames/01-no-room.html
- type: hook
- persuasion: Counterintuitive claim + In-place word swap (the claim turns on one word)
- beat: Surprise + recognition
- blueprint: kinetic-type-beats
- focal: line 2's question — "all the work?" in coral
- roles: line 1 = foreground (display, upper-third) · line 2 + coral phrase = foreground subject · hairline rule + mono footer = supporting · cream field = background
- blocks: none (kinetic type from the preset ramp)

narrativeRole: Opens a cognitive gap for anyone who has watched an agent degrade mid-task — it names the real constraint before the video names the idea.
keyMessage: The limit isn't model quality; it's space.

Scene 1 (0.0–2.4s): cream field with kicker only; the first line sets as one display line upper-third, revealed word by word left→right (stagger 0.08s) — nothing else on canvas, asymmetric 60/40 with purposeful empty space lower-right.
Scene 2 (2.4–4.4s): line two arrives beneath; "So why make it do" lands first, then "all the work?" snaps in a beat later in coral with one small scale pulse — a hard cut, not a fade, because the swap is the point.
Scene 3 (4.4–6.0s): the hairline rule draws left→right, the mono footer fades up as supporting chrome, and the frame holds still to the end — no drift, no breathing.

## Frame 2 — One head, turn by turn

- scene: A single outlined box (the context window) takes one card per beat; cards stack until the box is jammed edge to edge and the last card overflows the border. A row of turn arrows feeds the box from the left.
- copy: "One context window." · "Turn by turn: ask, wait, ask again." · "Every result lands back in the same head."
- duration: 8s
- poster: 6s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-one-head.html
- type: pain_point
- persuasion: Concretization (context window → a box that physically fills) + Causal chain
- beat: Recognition + claustrophobia
- blueprint: overwhelm-surround
- focal: the coral card that lands outside the box
- roles: context-window box = foreground subject · five result cards = supporting (the fifth = coral focal) · ask/wait arrows + three note lines = supporting · cream field = background
- blocks: none (shapes + type from the preset)

narrativeRole: Makes the abstract ceiling physical, and shows why "spawn more agents" doesn't fix it — the results still come back to one place.
keyMessage: With turn-by-turn orchestration, every agent's output is the parent's problem.

Scene 1 (0.0–1.2s): cream; the context-window box seats left (asymmetric 65/35), its hairline stroke drawing on; the mono label types in.
Scene 2 (1.2–4.6s): four result cards stack inside, one per beat (layer-reveal, 0.35s apart), each a quiet tile; then the fifth card arrives **outside** the box's border in coral — the overflow lands last and alone so it reads as the payoff.
Scene 3 (4.6–6.2s): the ask / wait / ask-again arrows feed in from the right, one per beat, each line drawing toward the box.
Scene 4 (6.2–8.0s): the three note lines reveal in order at the right; "Every result lands back in the same head." lands in coral; the caption strip settles and the frame holds.

## Frame 3 — Move the plan into a script

- scene: The jammed box from Frame 2 slides left out of frame as a code caret appears on the right; the thesis types in on the cream paper, then the code surface snaps in beside it.
- copy: "The plan doesn't have to live in the model's context." · "It can live in code."
- duration: 8s
- poster: 6s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-plan-in-code.html
- type: product_intro
- persuasion: Concept announcement + Contrast (head vs. code)
- beat: Clarity + orientation
- blueprint: kinetic-type-beats
- focal: "code." in coral
- roles: headline + sub = foreground subject · navy code surface = supporting stage for the next four frames · coral ✱ mark = supporting · cream field = background
- blocks: none

narrativeRole: Names the idea the rest of the video proves — the plan becomes an artifact (a script), not a memory.
keyMessage: A dynamic workflow is a JavaScript file the model writes — the plan moves from context into an artifact.

Scene 1 (0.0–3.0s): the jammed box from frame 2 slides off-frame left (continuity), leaving clean paper; the thesis sets in display type, upper-third, line by line.
Scene 2 (3.0–4.8s): "It can live in **code**." lands beneath with `code.` in coral; a hairline underscore draws under it.
Scene 3 (4.8–6.4s): the navy code surface rises into the right third (layer-reveal, 0.6s) and its placeholder lines fill in sequence — the surface is the promise frames 4–7 keep.
Scene 4 (6.4–8.0s): the coral ✱ mark line fades up last; held read, no drift.

## Frame 4 — The script

- scene: **Stage A (the script pane, navy code surface) opens and stays for Frames 4–7.** `meta` types in — name, description, phases — then a `phase('Scan')` call, then the first `agent(...)` call, each line landing with a hairline caret. Left rail shows the file name as a tab.
- copy: "A real script. Plain JavaScript." · "meta declares the run · phase marks progress · agent spawns work"
- duration: 9s
- poster: 7s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-the-script.html
- type: feature_showcase
- persuasion: Demonstration + Progressive disclosure (one line at a time)
- beat: Comprehension
- blueprint: typewriter-reveal (Adapt: the caret types real code, not a brand line)
- focal: the highlighted `agent(...)` call
- roles: navy script surface = foreground subject (the stage held through frame 7) · typed code = content · side rail (claim + three-line legend) = supporting · navy-soft field = background
- blocks: `code-typing` (deterministic token typing + caret tracking the frontier)
Adapt: keep the typing-with-caret signature exactly; the surface, ink, and caret colour come from `frame.md` (navy-soft panel, cream type, coral caret) — never the block's own chrome.

narrativeRole: Grounds the idea in the syntax the viewer will actually write, so Frame 5's mechanism has a referent.
keyMessage: The orchestration is ordinary JS — readable, diffable, editable.

Scene 1 (0.0–3.2s): navy ground; the script surface seats left (70/30 with the side rail); `const meta = {…}` types token by token with the caret tracking the frontier, slow enough to read.
Scene 2 (3.2–5.6s): `phase('Scan')` types; then `const findings = await parallel(` arrives as a unit (not typed) so the call's shape registers at a glance.
Scene 3 (5.6–7.6s): the `agent(...)` call types in and takes the coral underline highlight as it completes — the focal, and the handoff to frame 5.
Scene 4 (7.6–9.0s): the side rail reveals "A real script. **Plain JavaScript.**" then the three-line legend; hold still.

## Frame 5 — What one call spawns

- scene: The script pane holds; the `agent(...)` line is highlighted and the right side is a **node graph** (SVG): one `agent(prompt)` node fans out to three worker nodes, each tagged `own context window`, and all three edges converge on a `findings[3]` node — the results landing back in a script variable, never in a terminal.
- copy: "agent() spawns a real pi process." · "Its own context. It sees only its prompt."
- duration: 9s
- poster: 7s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-what-it-spawns.html
- type: feature_showcase
- persuasion: Demonstration + Diagram (call → three isolated workers → one collected variable)
- beat: Comprehension + "aha"
- blueprint: compose (node-graph fan-out; no terminal theater)
- focal: the three worker nodes and the `findings[3]` convergence
- roles: node graph = foreground subject (fills ~60% of canvas) · script pane (left) = supporting · clean-context tags + legend = supporting · navy field = background
- blocks: `svg-stroke-trace` (edges draw from measured path length)
Adapt: keep the draw-on-edge signature; restyle the nodes/tags to `frame.md`. No terminal chrome, no faked tool output — the graph is the whole argument.

narrativeRole: Establishes the isolation — each agent is a separate process with a clean window, which is why the parent's context stays small.
keyMessage: One call becomes N isolated workers, each with a clean slate — and their output lands in a variable, not in your window.

Scene 1 (0.0–2.0s): the script pane holds left (~35%); the `agent(...)` line highlights coral; the graph area is still empty navy.
Scene 2 (2.0–5.6s): the `agent(prompt)` hub seats first, then three edges **draw on** to three worker nodes — each node pops as its edge lands, each tagged "own context window".
Scene 3 (5.6–7.4s): three edges draw from the workers and converge on `findings[3]`; the node lands with a single soft coral bloom, sub-label "back in the script".
Scene 4 (7.4–9.0s): the mono legend ("no outputs in your window · three workers, three clean slates") fades up, the copy strip settles, and the frame holds.

## Frame 6 — What comes back

- scene: Split stage on the same navy surface: left pane lists what stays behind (`verdicts`, `findings`, `report` as named variables filling up), right pane shows a single hairline arrow labeled `return` crossing back to the parent, carrying exactly one value.
- copy: "Intermediate results stay in script variables." · "Only the return value crosses back."
- duration: 8s
- poster: 6s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-what-comes-back.html
- type: feature_showcase
- persuasion: Contrast (stays vs. crosses) + Subtraction (the parent gets less)
- beat: Clarity
- blueprint: comparison-split (Adapt: unequal halves — a full left pane and one thin arrow)
- focal: the single `return` arrow and its payload chip
- roles: three variable cards (left) = foreground subject · return arrow + `"2 findings"` chip = focal · parent box (right) = supporting · navy field = background
- blocks: none (hairline arrow + type)

narrativeRole: Completes the mechanism: the parent context holds the answer, not the journey.
keyMessage: Script variables absorb the work; the parent sees the result.

Scene 1 (0.0–3.6s): navy; the three variable cards stack on the left (60/40), each revealing in order, its micro-blocks filling after the name lands.
Scene 2 (3.6–5.2s): the single hairline `return` arrow draws across the gap; the cream payload chip `"2 findings"` slides along it and seats on the arrow's tip.
Scene 3 (5.2–6.8s): the parent box lights its hairline; "The answer. **Not the journey.**" reveals in two beats inside it.
Scene 4 (6.8–8.0s): the second copy line reveals; held read.

## Frame 7 — Fan out, or stream through stages

- scene: Two **node graphs** on the held stage, drawn as SVG. Panel A — `parallel([...])`: a source node fans to three agent nodes, whose edges converge on a coral dashed `barrier` node (`waits for all`) and then a `synthesize → report` node. Panel B — `pipeline(items, stage1, stage2)`: two dashed stage bands; item B sits in stage 1, item A has already moved to stage 2 and exits to `result`, item C is still `queued`.
- copy: "parallel([...]) — run a batch, wait at the barrier." · "pipeline(items, ...) — every item through every stage." · "Loop, filter, retry in plain JS — free."
- duration: 9s
- poster: 7s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/07-fan-out.html
- type: feature_showcase
- persuasion: Numbered enumeration + Demonstration (both shapes run)
- beat: Momentum + mastery
- blueprint: compose (two node-graph diagrams; no card grid)
- focal: panel A's coral dashed barrier, then panel B's stage bands
- roles: two node graphs = foreground subject (each fills its band) · stage bands + labels = supporting · footnotes + copy = supporting · navy field = background
- blocks: `svg-stroke-trace` (all edges draw on)
Adapt: keep the draw-on signature and the "waits for all" barrier semantics; both panels are SVG graphs, never card grids.

narrativeRole: Shows the two composition shapes that make scale practical, and that the glue between them costs nothing.
keyMessage: Two calls cover most orchestration: fan out and wait, or stream items through stages.

Scene 1 (0.0–3.2s): navy; panel A builds — the source node seats, three edges draw to three agent nodes (each popping as its edge lands), then all three draw inward onto the dashed coral barrier.
Scene 2 (3.2–4.6s): the barrier's "waits for all" label reveals, then one coral edge draws on to `synthesize → report` — the barrier is this panel's focal.
Scene 3 (4.6–7.4s): panel B builds below — two dashed stage bands seat, then item C (queued), item B (in stage 1) and item A (already in stage 2) place in order; arrows draw from C forward (dashed, waiting) and from A out to `result` (solid).
Scene 4 (7.4–9.0s): the footnote ("item A finishes while item B is still mid-flight — the chain, not the sum of stages") reveals, the copy strip lands, and the frame holds.

## Frame 8 — Verification you can't skip

- scene: The findings board: three verdict rows land (`confirmed`, `confirmed`, `confirmed`), then a skeptic row slides in under each and strikes one through — `refuted` — and that row desaturates and drops. The surviving two collapse into a single report line.
- copy: "A second agent tries to refute every finding." · "Verification runs because the script sequences it." · "Not because the model remembered to."
- duration: 9s
- poster: 7s
- transition_in: cut
- status: animated
- src: compositions/frames/08-verification.html
- type: benefit_highlight
- persuasion: Causal chain + Counterexample (one finding does not survive)
- beat: Conviction + unease (something was wrong)
- blueprint: agent-progress-theater (Adapt: refutation rows, not a checklist)
- focal: the finding that dies — struck through, desaturated, dropped
- roles: findings board (left) = foreground subject · verdict chips = supporting (one coral refuted) · navy report bar = supporting · side rail claim = supporting · cream field = background
- blocks: `success-check` (ring pop + path draw) for the confirmed chips
Adapt: keep the check-reveal mechanism for confirmations; the refutation uses a strike + desaturate + drop instead of a second check.

narrativeRole: Delivers the quality argument: when the plan is code, verification is structure, not a hope — and a wrong finding visibly dies.
keyMessage: Adversarial review is enforced by control flow.

Scene 1 (0.0–3.4s): cream; the board seats left (60/40). Three finding rows slide in one per beat; each verdict chip pops its confirm ring as the row settles.
Scene 2 (3.4–5.4s): the middle row's chip flips to refuted — the row desaturates, the title strikes through, and it drops; the coral skeptic row then slides in beneath with its reason. **This is the video's breath: after the strike, everything stops for ~0.4s.**
Scene 3 (5.4–7.2s): the navy report bar lands with `2 findings survive · 1 refuted and dropped`.
Scene 4 (7.2–9.0s): the side rail reveals "A second agent tries to refute every finding." then "Verification runs because the script sequences it." and the quieter "Not because the model remembered to."; hold.

## Frame 9 — A real run

- scene: A run record card assembles from the actual repo: run id, name `pine-oak-join`, status `complete`, two agent rows, wall clock `4.5s`. Then the two input-token figures count up side by side — `22,646` and `22,646` — and land on the honest total `45,330 tokens`.
- copy: "A real run from the repo." · "Two agents · one word each · 4.5 seconds." · "45,330 tokens."
- duration: 9s
- poster: 7s
- transition_in: crossfade
- status: animated
- src: compositions/frames/09-real-run.html
- type: social_proof
- persuasion: Statistical proof (real, unfaked numbers) + Concretization
- beat: Fascination + unease
- blueprint: dataviz-countup
- focal: the `45,330 tokens` total counting up
- roles: run-record card (left) = supporting evidence · the two `22,646` inputs + total = foreground subject · side rail proof lines = supporting · cream field = background
- blocks: `count-up` (token-native eased counter)
Adapt: keep the eased count-up landed on a restrained scale push; numerals are tabular Garamond/mono from `frame.md`, not the block's type.

narrativeRole: Proves the mechanism with a recorded artifact — and uses that artifact to introduce the cost honestly.
keyMessage: The parallelism is real; so is the bill.

Scene 1 (0.0–2.6s): cream; the run-record card seats left (55/45) and its five mono rows reveal in order — `complete` lands in the preset's success tone.
Scene 2 (2.6–5.6s): the two `22,646` figures count up to value with tabular numerals; a coral `+` and a thin `=` sit between them.
Scene 3 (5.6–7.2s): the total counts to `45,330 tokens` at display scale, then "for two words" sets beneath it — the honest gut-punch is the focal.
Scene 4 (7.2–9.0s): the side rail's proof lines reveal last; held read.

## Frame 10 — What it costs, what resume buys

- scene: Two cards on cream. Left: a cost meter fills to `45,330` with the caption about full sessions — one accent rule of coral. Right: a run timeline where two segments snap from `queued` to `cached` (greyed, cost `$0.0000`) and only the third segment runs live, labeled `resume`.
- copy: "Every agent is a full session — a workflow costs more than a chat turn." · "Label agents deterministically · resume replays finished work for free."
- duration: 9s
- poster: 7s
- transition_in: crossfade
- status: animated
- src: compositions/frames/10-cost-and-resume.html
- type: benefit_highlight
- persuasion: Comparison of two options (pay twice vs. resume) + Anchoring on a real number
- beat: Foresight + resolve
- blueprint: comparison-split
- focal: the resume timeline's two greyed `cached` segments
- roles: two cards = foreground subject (split 50/50) · cost meter = supporting instrument · resume timeline = focal · mono note = supporting evidence · cream field = background
- blocks: `mk-progress-stat` (big numeral + progress track)
Adapt: keep the fill-to-value track; recolour it to the preset's coral accent and set its numeral in the preset's display type.

narrativeRole: Answers the obvious objection with the mitigation, so the viewer leaves with a working mental model of the trade-off.
keyMessage: Workflows cost more — design for resume and it doesn't cost twice.

Scene 1 (0.0–3.4s): cream; two cards seat as a split. The left card's title and body reveal, then the cost meter fills to 45,330 with its scale labels.
Scene 2 (3.4–6.0s): the right card reveals its claim, then the resume timeline seats: two `cached · $0.0000` segments settle in grey and the third (`resume`) seats in navy with its coral label.
Scene 3 (6.0–7.6s): the mono note "run 1 failed on agent 3 · run 2 executed 1 agent" reveals beneath the timeline — the evidence for the claim.
Scene 4 (7.6–9.0s): the copy strip lands; hold.

## Frame 11 — The plan lives in code

- scene: The stage clears to cream. A terminal pill springs in and types the install command, holding with a blinking caret; a mono line beneath it recalls what the video proved (one script · dozens of agents · only the answer comes back), then both demote and the closing line lands centered, with the coral ✱ mark.
- copy: "pi install github.com/JairajSustained/pi-agent-workflows" · "one script · dozens of agents · only the answer comes back" · "The plan lives in code."
- duration: 7s
- poster: 5s
- transition_in: cut
- status: animated
- src: compositions/frames/11-landing.html
- type: cta
- persuasion: Distillation (compress to one line) + Callback (Frame 3's promise, now earned)
- beat: Satisfaction + resolve
- blueprint: prompt-type-submit-generate (install-command end-card variant)
- focal: the install command typing in the pill
- roles: terminal pill + typed command = foreground subject · mono recall line = supporting (demotes) · display closing line + coral ✱ = foreground landing · cream field = background
- blocks: `code-terminal-run` (one command types deterministically)
Adapt: keep the deterministic command typing with a held caret; the pill, stroke, and command type come from `frame.md` — no terminal chrome, no output logs.

Scene 1 (0.0–3.6s): cream clears to empty paper; the pill springs in centered with a single restrained move, then the install command types with a blinking caret that holds — the command is the focal.
Scene 2 (3.6–4.8s): the mono recall line ("one script · dozens of agents · only the answer comes back") fades up, then deliberately **demotes** — dims — as the closing line takes over.
Scene 3 (4.8–7.0s): "The plan lives in code." sets at display scale with the coral ✱ mark above it. This is the final frame, so it holds to the last frame with a single quiet settle.


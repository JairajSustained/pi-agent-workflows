---
workflow: faceless-explainer
flow: automation
storyboard: yes
message: "Dynamic workflows move the plan out of the model's context and into a script, so one session can run dozens of agents without drowning."
destination: youtube-embed
aspect: 1920x1080
language: en
length: 90s
angle: concept
audience: developers
narration: no
music: none
---

## Intent

A developer explainer for **pi-workflows** — a pi coding-agent extension that
brings Claude-style "dynamic workflows" to pi. The viewer is a developer who
already uses an LLM coding agent and has felt the ceiling: one context window,
sequential turns, every intermediate result landing back in the same head.

The video answers two questions in simple English: **what is a dynamic
workflow?** and **how does it actually work?** It should teach the mechanism
(script → isolated agents → only the final answer returns), show one real run,
and be honest about the trade-off (token cost).

Tone: clear, technical, zero marketing fluff — a good README that talks. Real
code and terminal output, not abstract hand-waving. No AI-hype vocabulary.

## Assets

None — faceless. All visuals are invented (typography, diagrams, terminal and
code mockups, data-viz). Source material is the repo's own documentation.

## Customizations

None opted in beyond defaults. **Fully silent** (user chose silence over HeyGen sign-in and local TTS) — meaning must live in typography, diagrams, code, and motion; no narration, no BGM, no SFX. Design preset: `code-editorial` (user picked by eye).

## Notes

- Source of information: the `pi-agent-workflows` repo — `README.md` and
  `ARCHITECTURE.md` (both copied into `capture/extracted/visible-text.txt`).
- Show the real primitives: `agent()`, `parallel()`, `pipeline()`, `meta`,
  `phase()`, `return`.
- Keep the honest limits in view: agents are full `pi` subprocesses, so a run
  costs meaningfully more tokens than a chat turn; resume replays cached
  agents; the script itself has no filesystem or network access.
- Avoid: generic "AI agents will change everything" framing, stock imagery,
  and any claim the repo doesn't back up.

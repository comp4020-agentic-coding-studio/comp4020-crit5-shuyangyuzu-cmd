# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.

## Rules carried forward

- Never convert a subjective impression into a factual claim about the subject
  of the prototype. A personal reaction ("this dataset feels overwhelming to
  me") is evidence I can use to shape the explainer; it is not itself a claim
  about the phenomenon and must not be written as one.
- Before adding a spec test, trace it to either a line in the published spec or
  an explicitly approved design decision I've recorded in the repo (e.g. a
  planning note). Don't invent a requirement the spec doesn't state just
  because it would be easy to test.
- When writing PROCESS.md, reflections, or other project evidence from my
  perspective, use "I" and "my"; never refer to me as "the student."
- Do not classify a continuous threshold or boundary event (reaching a target
  state, a mode switch, a pass/fail verdict) solely from animation frames or
  fixed-timestep samples. Derive the event analytically where a closed form
  exists, or use explicit event detection/interpolation against the
  continuous model, and verify boundary cases independently of render timing.
  A fixed-timestep discrepancy at a boundary is an implementation artefact to
  fix, not evidence that the boundary itself is ambiguous.
- When I request exact file contents, raw command output, or a complete diff,
  provide that primary evidence in the requested form before any summary or
  explanation. Never substitute a table, interpretation, completion claim, or
  previously shown tool output. If it is too long for one response, split it
  into numbered, complete sections with explicit line ranges and no omissions
  or silent truncation.
- When testing browser timing APIs, model their real clock origin and
  lifecycle semantics. In particular, requestAnimationFrame timestamps belong
  to the document timeline, not to an individual animation session; capture a
  per-session first timestamp and subtract it before treating time as elapsed.
  A fake clock that begins at zero is not evidence that production code
  handles a page that has already been open.

# HADR Monitor

A monitoring agent for humanitarian assistance and disaster response (HADR).

## What is HADR?

HADR — Humanitarian Assistance and Disaster Response — is the umbrella term
for how governments, militaries, UN agencies and NGOs detect, size up, and
mobilise around disasters: earthquakes, cyclones, floods, volcanic eruptions,
wildfires, drought, and the displacement and human need that follows. Before
anyone can send aid or forces, someone has to answer a smaller question
correctly: *what just happened, where, how bad, and who does it affect?* That
first hour is an information problem — multiple agencies report the same
event under different names and confidence levels, feeds go quiet or get
revised, and a slow-moving curated source (ReliefWeb) only confirms what the
fast, noisy sensor feeds (GDACS, USGS) suggested days earlier.

This project sits at that sensing layer, not the response layer: it doesn't
dispatch aid, it watches, reconciles, and reports — the input a human
decision-maker (or another agent downstream) needs before they can act.

## What this can handle

The three feeds in `feeds/` are multi-hazard and overlapping by design, which
opens up a design space wider than "print new earthquakes":

- **Multi-hazard coverage** — GDACS alone spans earthquakes, cyclones,
  floods, volcanoes, drought and wildfires, so the agent isn't limited to a
  single disaster type.
- **Cross-source reconciliation** — the same physical event (a quake, say)
  can arrive from GDACS, USGS, and eventually ReliefWeb under three different
  identifiers. There's room to correlate them into one story rather than
  reporting the same disaster three times.
- **Severity triage** — GDACS alert levels, USGS magnitude/`sig`/`alert`
  fields, and ReliefWeb's human curation are three different severity
  signals; the agent can use them to decide what's noise and what belongs in
  a report.
- **Graceful degradation** — feeds go down, get rate-limited, or revise
  events after publication (USGS explicitly allows this). The agent can be
  built to say something honest on a bad morning rather than go silent or
  crash.
- **Scheduled, unattended reporting** — a recurring routine that produces a
  situation report without a human kicking it off, and stays quiet when
  there's nothing new to say.
- **Extensibility** — the feed set, report format, and schedule are all
  starting points, not fixed requirements; the architecture can grow to more
  sources or different output surfaces.

None of the *how* — dedup strategy, alert-level normalisation, polling
frequency — is specified here on purpose; each feed's `## Open questions`
section is where that design work starts.

## The end state

By Wednesday afternoon this repository contains an agent that:

- watches live disaster feeds — GDACS, USGS and ReliefWeb (see `feeds/`)
- filters out the noise and assesses what remains: what happened, where, how bad, who is affected
- publishes a morning situation report to `dashboard.html` at 08:30 Singapore time
- runs on a schedule, unattended, and stays quiet when nothing has changed

How it does any of that is not specified anywhere in this repository. That is the course.

## The three days

1. **Plan** — interrogate the feeds, write the PRD, cut it into vertical slices
2. **Autonomy** — build the first slice, write a skill, wire up the 08:30 routine, launch the overnight loop
3. **Trust** — review code you didn't write, harden the pipeline, demo

## Artefacts expected by the end

`prd.html` · `system-view.html` · `implementation-notes.md` · `dashboard.html` · `goal.md` · at least one skill

## Day 1 setup

1. Sign in to Claude Code with your Team seat
2. Create your own repository from this template, then clone it
3. Run `/install-github-app` so @claude reviews your pull requests from Day 2
4. Install OpenCode and sign in with your Go key

Fill in `CLAUDE.md` before your first prompt.

---
name: Pathways
description: One next step with a date, every fact cited to its record. Mano's kitchen-table warmth on Front Door's structure.
colors:
  pen: "#2443d6"
  pen-deep: "#1a33a8"
  pen-soft: "#e9edfc"
  on-pen: "#ffffff"
  on-pen-2: "#dfe5ff"
  hl: "#ffe14a"
  good: "#1f7a4d"
  good-soft: "#e3efe8"
  ask: "#7a4a00"
  ask-soft: "#fdf1d8"
  miss: "#a3341c"
  miss-soft: "#fbe4dd"
  paper: "#ffffff"
  paper-2: "#f6f5f2"
  paper-3: "#eeece7"
  ink: "#121212"
  ink-2: "#33332f"
  muted: "#55554f"
  line: "#e7e5e0"
  rail: "#8f8c84"
typography:
  display-start:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 11vw, 3.4rem)"
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  display-step:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 9vw, 2.75rem)"
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 8.4vw, 2.6rem)"
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 650
    lineHeight: 1.3
  wordmark:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  sub:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
  source:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "0.01em"
rounded:
  mark: "4px"
  field: "12px"
  card: "16px"
  bubble: "20px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  gap: "10px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
  section: "44px"
components:
  button-primary:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.on-pen}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.pen-deep}"
    textColor: "{colors.on-pen}"
  button-primary-disabled:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-3}"
  button-on-pen:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pen}"
    rounded: "{rounded.pill}"
    height: "52px"
    width: "100%"
  button-on-pen-hover:
    backgroundColor: "{colors.on-pen-2}"
  button-neutral:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "52px"
  link:
    textColor: "{colors.pen}"
    height: "44px"
  choice:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0 20px"
    height: "60px"
  choice-picked:
    backgroundColor: "{colors.pen-soft}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "13px 14px"
    height: "48px"
  input-focus:
    backgroundColor: "{colors.paper}"
  starter:
    backgroundColor: "{colors.pen-soft}"
    textColor: "{colors.pen-deep}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  program-card:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px"
  advisor-check:
    backgroundColor: "{colors.ask-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  bubble-me:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.on-pen}"
    rounded: "{rounded.bubble}"
    padding: "12px 15px"
  bubble-them:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "12px 15px"
  bubble-unsure:
    backgroundColor: "{colors.ask-soft}"
    textColor: "{colors.ink}"
  crisis-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "22px 20px 20px"
  tabs:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "4px"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
---

# Design System: Pathways

## Overview

**Creative North Star: "The Kitchen Table, Filed Properly"**

Pathways reads like a plan written on warm paper in blue pen, then checked line by line. The world is Mano's: white and warm off-white paper, near-black ink, one blue pen that does all the acting, and a single yellow highlighter stroke on the date that matters. The structure is Front Door's: the answer first, then the sources, then the steps, with every fact carrying the record it came from and the day it was last checked.

The surface is a single phone column. Density is low and type is large, because the reader is a 17-year-old between classes. Separation comes from tint, never from lines: cards are one shade darker than the page, and the page never draws a border or a rule to divide itself. The start screen flips the world: the whole ground is pen blue and the controls go white.

Motion is calm and short. A screen rises 6px into place, and the highlighter draws across the next step's date each time a plan appears. Nothing loops, bounces or waits on the reader.

**Key Characteristics:**
- One phone column, 30rem wide at most, 20px side gutter.
- Paper tints for surfaces, no borders on cards, no dividers.
- Pen blue is the only action color; yellow marks one date.
- Status is always a dot plus words, never color alone.
- Every fact sits next to a source line: record ID and checked date.
- Light mode only (`color-scheme: light`).

## Colors

Warm paper and ink with one blue pen for action, one yellow highlighter for the date, and three Front Door status pairs that always travel with words.

### Primary
- **Pen Blue** (pen): the one action color. Primary buttons, the walked stretch of the road, the target dot, links, focus rings, the student's own chat bubbles, the checked circle in multi-select rows, and the whole ground of the start screen.
- **Deep Pen** (pen-deep): hover for primary buttons and the text color on starter chips.
- **Pen Wash** (pen-soft): the picked and hover state of a choice row, starter chips, and the halo around the road's target dot.
- **On Pen** (on-pen) and **On Pen Quiet** (on-pen-2): white text on the blue start screen, and the softer lede, hint and footer text there. On Pen Quiet is also the hover fill for the white start button.

### Secondary
- **Highlighter Yellow** (hl): the single date in the plan headline, drawn as a stroke. Also used as interaction feedback only: text selection, and the focus ring and input focus border on the blue start screen, where pen blue would vanish.

### Tertiary (status)
- **Good Green** (good) on **Good Wash** (good-soft): a program that fits, and the "Passed checks" verdict on the how page.
- **Ask Amber** (ask) on **Ask Wash** (ask-soft): something only a person can confirm. The advisor-check box, unsure chat replies, the advisor suggestion box and the nudge. The 9px status dot for this tone is a brighter amber (#c98a12) so it reads at that size.
- **Miss Red** (miss) on **Miss Wash** (miss-soft): a program that does not fit or a closed path, and the "Replaced" verdict on the how page.

### Neutral
- **Paper** (paper): the page ground on every screen except start.
- **Warm Paper** (paper-2): every surface that sits on the page. Choice rows, program cards, secondary buttons, inputs, their chat bubbles, the tab track, zebra rows.
- **Pressed Paper** (paper-3): hover on secondary buttons, the unwalked road line, empty progress segments, the disabled primary button.
- **Ink** (ink): headings, choice labels, facts, anything the reader must not miss.
- **Ink Soft** (ink-2): body copy and the plan message.
- **Muted** (muted): source lines, hints, table headers, past road stops. Passes 4.5:1 on Paper and Warm Paper.
- **Rail** (rail): the ring of a road stop and the empty check circle in multi-select rows.
- **Line** (line): one use only, the hairline ring on the floating crisis card. Not a divider color.

### Named Rules
**The One Pen Rule.** Pen blue is the only color that means "you can act here". No second action color, no links in another hue.

**The One Stroke Rule.** Yellow highlights exactly one thing per screen: the next step's date, in the headline or in the line under it, never both. Selection and start-screen focus are interaction feedback, not content.

**The Words-With-Color Rule.** A status tint never appears without words that say the same thing ("Another path to look at", "Passed checks", "Replaced", "passed"). Color only repeats what the text says.

## Typography

**Display Font:** Schibsted Grotesk 600 to 800, self-hosted variable in `public/fonts` (fallback ui-sans-serif, system-ui)
**Body Font:** Geist 400 to 600, self-hosted variable in `public/fonts` (fallback ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Mono:** ui-monospace, SF Mono, Menlo, for raw model payloads on the how page only.

**Character:** a sturdy newsprint grotesk for headings, set heavy and tight, over a clean neutral sans for everything read at length. Headings use `text-wrap: balance`. Both faces are preloaded.

### Hierarchy
- **Display, start** (750, clamp 2.5rem to 3.4rem, 1.04): the start screen's one sentence, white on pen, dropped 18vh down the screen.
- **Display, step** (750, clamp 2.1rem to 2.75rem, 1.04): the plan headline, which is the next step itself.
- **Headline** (750, clamp 2rem to 2.6rem, 1.04): question titles, advisor screen, how page.
- **Title** (700, 1.3rem, 1.2): plan section heads ("Your road", "Your options"). A 1.12rem variant heads the advisor-check box, advisor screen subsections and the how-page columns.
- **Title small** (650, 1.08rem, 1.3): program names inside program cards.
- **Sub** (Geist 600, 1.15rem, 1.4): the line under the plan headline naming the open question.
- **Body** (400, 1rem, 1.5): everything else. The plan message runs 1.06rem, max 60ch.
- **Label** (600, 1rem): buttons. Choice rows are 600 at 1.1rem. Form labels are 550.
- **Source** (400, 0.8125rem, +0.01em, Muted): record ID and checked date.

### Named Rules
**The Sentence Case Rule.** Every label, heading and source line is sentence case. No uppercase tracked labels, no small caps, no line above a heading that introduces it.

**The Tabular Days Rule.** Day counts use `font-variant-numeric: tabular-nums` so "23 days left" holds its width.

## Layout

A single centered column, `max-width: 30rem`, padded 20px at the sides, `max(20px, safe-area-inset-top)` at the top and 32px at the bottom. The how page widens the same column to 64rem and sets its three rule blurbs in a three-column grid from 800px up. The footer follows the column width and holds the 988 and 911 line on every screen.

Rhythm on the plan screen: the next-step block starts 4px under the top bar, then each later section starts 44px below the last. Inside a block, steps run 10, 12, 14, 18 and 24px. Stacks of tappable things (choices, actions, options) use a 10 to 12px gap. Questions put 28px under the top bar and 32px above the choices.

The top bar is 44px tall: wordmark or Back on the left, Start over or progress on the right. Progress is a row of 28 by 6px rounded segments, filled pen as questions are answered.

**The Thumb Reach Rule.** At 390px wide, the step, its date, the open question, days left and the primary action fit in the first viewport. Actions stack: the primary full width, the secondary buttons sharing one row below it.

**The 44 Floor Rule.** Every tap target is at least 44px tall. Buttons are 52px (48px small), choice rows 60px, inputs 48px, links, chips and tabs 44px.

## Elevation & Depth

The system is flat and tonal. Depth comes from the three paper tints. Program cards, choice rows, the advisor-check box and chat bubbles have no shadow and no border. Shadows exist in three narrow places, each tied to a job: the primary button's pen-tinted glow so the one action lifts off the page, the selected how-page tab as a raised segment in its track, and the crisis card, which floats over everything.

### Shadow Vocabulary
- **Pen glow** (`box-shadow: 0 6px 16px -8px rgb(36 67 214 / 0.6)`): primary buttons only. Removed when disabled.
- **Soft lift** (`--shadow`: `0 1px 2px rgb(18 18 18 / 0.05), 0 8px 24px -12px rgb(18 18 18 / 0.14)`): the selected tab in the how-page tab track.
- **Overlay** (`box-shadow: 0 30px 80px -20px rgb(17 24 39 / 0.45)`): the crisis card, fixed to the bottom of the screen.

### Named Rules
**The Tint Not Line Rule.** A surface separates from the page by being Warm Paper on Paper. Never a border, never a rule, never a shadow on a resting card.

## Shapes

Soft and rounded, never sharp. Cards and choice rows use the 16px card radius. Inputs, the nudge and table rows use 12px. Chat bubbles and the crisis card use 20px; bubbles tuck the corner on the speaker's side to 8px. Every button, chip and tab is a full pill. Status dots and road stops are circles. The highlighter mark rounds its ends at 4px.

## Components

### Buttons
Tactile pills, one loud and the rest quiet.
- **Shape:** full pill, 52px tall.
- **Primary:** pen blue, white label, full width, pen glow. Hover deepens to Deep Pen. Disabled turns Pressed Paper with Muted text and drops the glow.
- **Secondary:** Warm Paper with Ink label; siblings share one row equally. Hover goes to Pressed Paper.
- **On pen:** white with a pen label, start screen only. Hover goes to On Pen Quiet.
- **Neutral:** Ink with a white label, used for Close on the crisis card.
- **Small:** 48px tall, auto width, for inline form submits.
- **Press:** every button scales to 0.98 over 150ms ease-out.
- **Focus:** 3px pen outline at 3px offset (yellow on the start screen).
- **Link:** underlined pen text, 1px underline at 3px offset, 44px tall. Used for Back, Start over and "Ask an advisor about this".

### Choice rows
- **Single choice:** a 60px Warm Paper row, 16px radius, 600 label at 1.1rem, left aligned. A tap answers and advances; there is no Continue. Hover and picked both go to Pen Wash.
- **Multi-select:** the same row with `aria-pressed`, label left and a 22px circle right. Unchecked is a Paper circle with a 1.5px Rail ring. Checked fills pen blue with a white check stroke (inline SVG, 14px). A full-width primary Continue sits 20px below and stays disabled until a row is picked.

### The plan headline
The next step is the h1, and its date is wrapped in a highlighter mark: Ink text over a yellow band 80% of the line tall, sitting at 62% from the top, with 4px padding, -2px side margins and 4px corners. When the date belongs to the open question instead, the mark moves to the sub line. Below it: days left (Ink, 550, tabular) on its own line, the source line, the model's message, the actions, and then "This is your plan, not an application." in Muted 0.875rem.

### Advisor-check box
An Ask Wash panel, 16px radius, 20px padding, no border. The heading is Ask Amber; the bulleted list and body are Ink. It names only what a person must confirm.

### The road
A vertical date rail and the plan's signature. Each stop shows its date in Ink 650, the stop name below, and the source line below that.
- **Rail:** a 2px Pressed Paper line between stops.
- **Walked:** the stretch from Today to the next step is pen blue.
- **Stops:** a 12px Paper circle ringed 2px in Rail. Today is a solid Ink dot. The target is a 14px pen dot with a 3px Pen Wash halo, and its name goes Ink 550.
- **Past:** date and name go Muted with a 1px line-through and the word ", passed".

### Program cards
Warm Paper, 16px radius, 18px padding, flat. The program name in title small, then a status line: a 9px dot in the tone color and the status words in the same tone at 550. Then a bulleted fact list in Ink (dates live on the road, not here) and one source line. The state aid card uses the same shell without a status line.

### Source lines
`PRG-02 · checked Oct 20, 2026`, or `ADV-01 · no check date in the records` when the record has none. Muted 0.8125rem, never wraps. Placed inline after the claim it backs, or on its own line under a list or a road stop.

### Chat bubbles
- **Theirs:** Warm Paper, left aligned, 88% max width, 20px radius with the bottom left at 8px. Source lines sit inside, under the text.
- **Unsure:** the same bubble in Ask Wash, with an "Ask an advisor about this" link.
- **Mine:** pen blue with white text, right aligned, bottom right at 8px.
- **Starters:** 44px Pen Wash pills with Deep Pen text, wrapping in a row above the input.

### Crisis card
Fixed to the bottom of the viewport, 12px in from the edges, Paper on the overlay shadow, 20px radius. Heading, then 911 and 988 as bold pen links, then a full-width neutral Close. Rises in over 220ms. Escape closes it. It appears on crisis words with no model call.

### Inputs
Warm Paper fill, 1.5px transparent border, 12px radius, 48px tall, pen caret. Focus turns the fill Paper and the border pen blue. On the start screen inputs are a 12% white wash with white text; focus raises the wash to 18% and turns the border yellow.

### How-page tabs and tables
- **Tabs:** a Warm Paper pill track with 4px padding. Each tab is a 44px pill, Muted 600 at 0.9375rem. The selected tab is Paper with Ink text and the soft lift. Arrow keys move between tabs.
- **Tables:** no borders, no rules. Zebra rows in Warm Paper with 12px rounded row ends, 14px by 12px cells, Muted 0.8125rem headers. Under 640px each row becomes a Warm Paper block with 14px radius and a Muted label above each value. Verdicts are 600 in Good Green or Miss Red, with problem codes in Muted beneath. Raw payloads open from pen-colored summaries into a Paper mono block.

### Motion
- **Rise:** every screen enters from opacity 0 and 6px lower over 260ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Highlighter stroke:** the mark's band grows from 0% to 100% width over 700ms on the same curve, after a 250ms delay. It replays on every new plan by removing and re-adding the drawn state across two animation frames.
- **State changes:** background, border and press transforms run 150ms ease-out; progress segments 200ms.
- **Reduced motion:** `prefers-reduced-motion: reduce` collapses every animation and transition to 1ms with no delay, so screens appear in place and the date is already highlighted.

## Do's and Don'ts

### Do:
- **Do** give each screen exactly one pen-blue primary button. On the plan screen it matches the step: "Ask an advisor now" when something must be confirmed or no future date exists, the calendar otherwise.
- **Do** put a source line (record ID and checked date) next to every fact, including facts in chat replies and on the road.
- **Do** pair every status tint with words that say the same thing.
- **Do** separate surfaces with Warm Paper on Paper and keep cards flat.
- **Do** keep every tap target at 44px or taller and text contrast at 4.5:1 or better.
- **Do** keep light mode only. The root declares `color-scheme: light` and nothing follows the system theme.

### Don't:
- **Don't** use yellow for anything but the one date stroke, apart from selection and start-screen focus feedback.
- **Don't** put a small label above a heading. No eyebrows, kickers or section numbers.
- **Don't** add borders to cards, or dividers and rules between sections, list items or table rows.
- **Don't** show a status by color alone, or a fact without its record ID and checked date.
- **Don't** introduce a second action color or a second filled primary button on the same screen.
- **Don't** add a dark theme.

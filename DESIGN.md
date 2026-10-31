---
name: Bill Splitter
description: A bill split that looks like the group's own party poster until the money is on screen, then stays perfectly legible.
colors:
  brand-green: "#00b368"
  on-green: "#04261a"
  green-text: "#007a50"
  green-strong: "#006b47"
  green-soft: "rgb(0 179 104 / 0.14)"
  positive: "#1f7a50"
  danger: "#b93e38"
  danger-soft: "rgb(185 62 56 / 0.1)"
  warn: "#7a4e0c"
  warn-soft: "rgb(232 172 114 / 0.22)"
  info: "#2f5f8a"
  info-soft: "rgb(134 178 222 / 0.22)"
  page: "#eef4ee"
  ink: "#0b1b14"
  ink-2: "#47574f"
  ink-3: "#4f5f57"
  card: "#ffffff"
  raised: "#ffffff"
  panel: "#f6faf5"
  line: "rgb(11 27 20 / 0.14)"
  raised-line: "rgb(11 27 20 / 0.16)"
  field: "rgb(11 27 20 / 0.06)"
  scrim: "rgb(3 14 10 / 0.45)"
  square-a: "#dcebdf"
  square-b: "#c5dfcc"
  scene-sky: "#0c3fb0"
  on-scene: "#ffffff"
  on-scene-2: "#f0f6ff"
  green-text-night: "#2ee08f"
  green-strong-night: "#7cf0b8"
  green-soft-night: "rgb(46 224 143 / 0.16)"
  positive-night: "#8fd3a0"
  danger-night: "#f0958e"
  danger-soft-night: "rgb(240 149 142 / 0.14)"
  warn-night: "#e8ac72"
  warn-soft-night: "rgb(232 172 114 / 0.14)"
  info-night: "#86b2de"
  info-soft-night: "rgb(134 178 222 / 0.14)"
  page-night: "#060d0a"
  ink-night: "#f1f7f2"
  ink-2-night: "#a8b8ae"
  ink-3-night: "#9dada3"
  card-night: "#101a15"
  raised-night: "#18241e"
  panel-night: "#0c1511"
  line-night: "rgb(190 235 210 / 0.16)"
  raised-line-night: "rgb(190 235 210 / 0.2)"
  field-night: "rgb(190 235 210 / 0.1)"
  scrim-night: "rgb(0 0 0 / 0.6)"
  square-a-night: "#12201a"
  square-b-night: "#1c2e25"
  scene-sky-night: "#020612"
  on-scene-night: "#5cf0b4"
  on-scene-2-night: "#d8f7e7"
typography:
  display:
    fontFamily: "Anybody Expanded, Kanit, Arial Black, system-ui, sans-serif"
    fontSize: "min(12vw, 88px)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Anybody Expanded, Kanit, Arial Black, system-ui, sans-serif"
    fontSize: "calc(var(--t, 34) * 1px)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.015em"
  page-title:
    fontFamily: "Anybody Expanded, Kanit, Arial Black, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.015em"
  total:
    fontFamily: "Anybody Expanded, Kanit, Arial Black, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  section-label:
    fontFamily: "Anybody Expanded, Kanit, Arial Black, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 900
    letterSpacing: "0.01em"
rounded:
  hair: "2px"
  thumb: "6px"
  control: "8px"
  bar: "10px"
  sheet: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  stack: "14px"
  gutter: "16px"
  inset: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.on-green}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    textColor: "{colors.green-text}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  icon-button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "44px"
  chip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  chip-assigned:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green-strong}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "16px 20px"
  nav-bar:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink-2}"
    width: "100%"
  nav-item-active:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green-strong}"
    rounded: "{rounded.control}"
    height: "52px"
  nav-scan:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.control}"
    size: "62px"
  sheet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  action-bar:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bar}"
    padding: "8px"
  rank-square:
    backgroundColor: "{colors.square-a}"
    textColor: "{colors.ink-2}"
    height: "60px"
  rank-square-current:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.on-green}"
    height: "60px"
---

# Design System: Bill Splitter

## Overview

**Creative North Star: "The Group's Party Poster"**

The top of a page is a poster: a surreal Y2K collage of big sky, a perspective emerald checkerboard, tall grass, oversized flowers, glossy green chess pieces and a lilac retro computer showing a pixel divide sign, with ultra-wide black caps set in the clear sky. Then the money arrives and the poster steps back. Everything someone works with sits on solid, flat panels with small corners, in a calm green-tinted neutral, and every page ends in a meadow.

The density is that of a phone tool used one-handed at a table at night: 44px targets, 17px body, tabular amounts. Personality lives in the scene, the checker details, the pawn walking along the steps and the meadow, never in the rows where somebody is reading an amount. Light and dark are the same world at different hours: a cobalt day with a white-and-emerald board, and a near-black night with a moon and a black-and-emerald board.

The world rejects the soft fintech card stack and the frosted glass it replaced. The visual language follows the user's chosen reference campaign, translated to the app's green and drawn from scratch.

**The Drawn From Code Rule.** All artwork comes from `scripts/make-art.py`, which draws the scene, meadow, share-card sky and favicons procedurally with no source images. New artwork extends that script. It must never reuse the reference campaign's images.

**Key Characteristics:**
- A full-bleed scene at the top of the home and shared-bill pages, breaking into the page through two rows of squares.
- Ultra-wide black caps for short titles and headline totals only.
- Solid panels, 8px corners, hairline borders, no glass.
- Chess as the interface's own metaphor: steps are a rank, the pawn promotes to a queen on Share.
- A meadow growing from the bottom of every page.

## Colors

One saturated brand green on green-tinted neutrals, with all other hue left to the artwork. Each role has a night value, named with a `-night` suffix in the tokens.

### Primary
- **Brand Green** (#00b368): The fill for primary buttons, the scan square, the current rank square, the on state of switches, checker details, selection and the scrollbar. It is the same in both modes.
- **Deep Forest On-Green** (#04261a): Text and icons on Brand Green, at 5.9:1.
- **Text Green** (#007a50, night #2ee08f): Green text and icons on white cards, ghost buttons, the focus ring and the caret.
- **Strong Green on Tint** (#006b47, night #7cf0b8): Green text on Soft Green: the active nav item, assigned chips and completed step labels.
- **Soft Green** (14% Brand Green, night 16% #2ee08f): The active nav item, assigned chips and success callouts.

### Secondary
- **Cobalt Scene Sky** (#0c3fb0, night #020612): Paints behind the scene image until it loads. It also sets the mood of the poster region.
- **On-Scene** (white #ffffff, night luminous green #5cf0b4): Poster titles and totals over the sky.
- **On-Scene Soft** (#f0f6ff, night #d8f7e7): The date and details line in the scene.

### Tertiary
- **Quiet Status Colors**: Positive (#1f7a50), Warn (#7a4e0c), Info (#2f5f8a), each with a soft tint for callouts. In callouts the icon carries the tone and the text stays Ink.
- **Danger Red** (#b93e38, night #f0958e): Negative amounts and errors only.
- **Person Tags**: Muted avatar colours from `src/lib/colors.ts` (#93c79c, #86b2de, #9f9dda, #e39ab4, #e8ac72, #7fc4bd, #92c1d1, #a9a9b0) with dark text. They identify people and carry no status.

### Neutral
- **Pale Meadow Mist** (#eef4ee, night #060d0a): The page, and the in-app browser's status bar and toolbar strips.
- **Ink** (#0b1b14, night #f1f7f2): Primary text. Inverted, it fills selected chips and segments.
- **Ink 2 and Ink 3** (#47574f and #4f5f57, night #a8b8ae and #9dada3): Secondary text, labels and placeholders.
- **White Card, White Raised and Pale Panel** (#ffffff, #ffffff, #f6faf5; night #101a15, #18241e, #0c1511): Content, then floating controls and the nav bar, then sheets and dialogs.
- **Hairlines and Fields** (14%, 16% and 6% Ink; night 16%, 20% and 10% pale green): Card borders, raised borders and input fills.
- **Rank Squares** (#dcebdf and #c5dfcc, night #12201a and #1c2e25): The alternating squares of the step rank.

### Named Rules
**The Dark On Green Rule.** Text and icons on Brand Green are always Deep Forest On-Green, never white.

**The Green Text Rule.** Brand Green is a fill, not a text colour. On white, green text is Text Green; on Soft Green, it is Strong Green.

**The Only Red Rule.** In the interface, red means a negative amount or an error, and nothing else. The artwork's coral flowers and computer lights are part of the world and exempt.

## Typography

**Display Font:** Anybody Expanded Black (with Kanit ExtraBold for Thai, then Arial Black)
**Body Font:** The platform's own sans (-apple-system, SF Pro Text, with Thonburi and Noto Sans Thai for Thai)
**Label/Mono Font:** No separate face. Numbers use tabular figures in whichever face they are set.

**Character:** A loud, ultra-wide poster face against the quiet font the phone already renders best. Kanit is fetched only when Thai appears in poster type, so bill names in Thai stay in the same voice.

### Hierarchy
- **Display** (900, min(12vw, 88px) on phones, 48px from 768px so it clears the chess pieces, 0.98, uppercase): The app's name on the home poster. It collapses to 22px on one line once a draft is under way.
- **Headline** (900, 44, 34, 26 or 21px by title length up to 10, 18 and 30 characters, ×1.35 from 768px, 0.98, uppercase): The bill's title in the scene. The longer the name, the smaller the type, so any bill fits.
- **Page Title** (900, 30px, 38px from 768px, 0.98, uppercase): Titles on pages without a scene, always with a 96px checker rule beneath.
- **Total** (900, 40px, 64px from 768px, 1, -0.02em): The bill total in the scene. The same face at 20px carries the grand total in the action bar.
- **Title** (600, 17px, 1.45): Sheet titles and buttons. Primary buttons step up to 700.
- **Body** (400, 17px, 1.45): Running text, inputs and row content.
- **Body Small** (400 to 600, 15px): Chips, segments, callouts and the scene's date line.
- **Label** (400, 13px): Field labels and hints.
- **Section Label** (900, 11px, 0.01em, uppercase): The short heading above a card, in the poster face and Ink 2.

### Named Rules
**The Poster Type Rule.** The display face is for short titles, totals and the headings above cards. It is never used for running text.

**The Tabular Money Rule.** Amounts always use tabular figures, with the currency symbol and decimals at 62% size, so the whole number is what you read.

**The Date Below Rule.** The date and details line sits under the title and total, in the scene and on the share card. It never sits above the title.

## Layout

A single centred column (672px) with a 16px gutter serves phone and desktop alike, while the scene, the nav bar and the meadow run the full width of the screen. Cards sit inside the column with 20px insets, and hairlines between rows stop at those insets. Stacks use 14px inside a section and 16 to 24px between sections.

The home poster is clamp(270px, 44svh, 400px) tall on phones and 500px from 768px, then collapses to a slim strip when a draft has items or has passed step one. The collapse is applied before first paint. Shared bills use a scene at least 250px tall, 360px from 768px, with the title and total in the sky and all payment work on cards below.

The nav bar sits at the bottom on phones and at the top from 768px. The wizard's action bar floats 8px above it on phones and 16px from the bottom of the screen on desktop.

**The Meadow Ending Rule.** Every page ends in the meadow, clamp(170px, 24vw, 300px) tall, growing up from the nav bar on phones and from the bottom of the screen on desktop. It sits behind the content, so the last card may overlap its grass tips. It is decorative, hidden from assistive technology and loaded lazily.

## Elevation & Depth

A hybrid: content is flat, and only things that float over content cast a shadow. Cards rely on a hairline border and tonal contrast with the page. Floating controls lift gently, sheets lift further over a scrim, and all depth beyond that belongs to the artwork.

### Shadow Vocabulary
- **Raised** (`box-shadow: 0 10px 24px -12px rgb(11 27 20 / 0.32), 0 2px 4px rgb(11 27 20 / 0.06)`; night `0 10px 24px -12px rgb(0 0 0 / 0.8), 0 2px 4px rgb(0 0 0 / 0.3)`): The action bar, toolbar circles, the rank and the scan square.
- **Panel** (`box-shadow: 0 24px 60px -14px rgb(3 14 10 / 0.45)`; night `0 24px 60px -14px rgb(0 0 0 / 0.8)`): Sheets and dialogs.
- **Primary Glow** (`box-shadow: 0 8px 16px -10px rgb(0 135 90 / 0.8)`): A soft green pool under primary buttons.
- **Scene Text** (`text-shadow: 0 2px 12px rgb(0 0 0 / 0.25)`, up to 0.35 opacity on the date line): Holds poster type off the sky. It is used only on the scene.

### Named Rules
**The Flat Card Rule.** Cards have no shadow. A shadow means the element floats above the page.

**The Cheap To Paint Rule.** No `backdrop-filter` or CSS blur filter in the interface; every working surface is solid, because the app runs on phones on mobile data. Soft shading baked into the rasters is part of the artwork and is fine.

## Shapes

Small, firm corners against the square logic of the checkerboard. Controls and cards take 8px, the action bar 10px, and sheets and dialogs 12px. Circles are reserved for 44px icon buttons and avatars.

The recurring silhouette is the checker square: two rows at the scene's lower edge (20px squares in the page colour), a band along the top of every sheet (16px) and a 96px rule under page titles (12px). The logo is built from the same squares on a 16-unit grid: a square-cut divide sign above two rows of a chessboard on a green tile with a 3.5-unit corner.

## Components

### Buttons
Firm and direct, with a slight squeeze when pressed.
- **Shape:** Gently curved corners (8px), 44px minimum height, 20px side padding, with an 8px gap before any 2px-stroke line icon.
- **Primary:** Brand Green with Deep Forest text at weight 700, and the Primary Glow.
- **Hover / Focus:** Every control scales to 0.95 on press over 0.2s on the shared spring. Secondary and ghost buttons take a 6% Ink hover wash. Focus is a 2px Text Green outline, offset 2px. Disabled drops to 40% opacity.
- **Secondary:** White Raised with a hairline border and Ink text, flat.
- **Ghost:** Text Green on no fill.
- **Icon:** A 44px circle with a 22px line icon, Raised when floating and unfilled inside a card row. A confirm circle in Brand Green sits at the top right of a sheet.

### Chips
- **Style:** 44px tall, 8px corners, 15px medium text, White Raised with a hairline border.
- **State:** Selected inverts to solid Ink with page-coloured text. Assigning a person uses Soft Green, Strong Green text and a 1px inset Text Green line. Segmented controls share the inverted selected state.

### Cards / Containers
- **Corner Style:** Gently curved (8px).
- **Background:** White Card (#101a15 at night).
- **Shadow Strategy:** None, per the Flat Card Rule.
- **Border:** 1px hairline at 14% Ink.
- **Internal Padding:** 16px by 20px, with half-pixel row dividers inset 20px from each side.

### Inputs / Fields
- **Style:** A tinted fill at 6% Ink with no stroke, 8px corners, 48px minimum height and 17px text. Money inputs are right-aligned tabular figures with the symbol held at the left.
- **Focus:** A 2px Text Green outline with no offset, and a Text Green caret.
- **Error / Disabled:** Invalid or negative money turns the text Danger Red.

### Navigation
A solid bar across the whole screen, White Raised with a single 1px border on its inner edge. It carries four links with 22px line icons: stacked 11px labels on phones, side by side at 15px from 768px, both weight 600. Inactive links are Ink 2. The active link is a 52px Soft Green block with Strong Green text. Scan receipt is a separate 62px Brand Green square beside the links, with the Raised shadow, and opens the camera directly from any page.

### Sheets and Dialogs
Native dialogs in Pale Panel with the checker band along the top, 12px corners and the Panel shadow over a scrim. Sheets slide up over 0.45s, hold a drag handle and a 44px close circle at the top left, and dismiss on a 90px swipe. They rest 8px from the screen edges on phones and centre at 640px wide. Alerts are 320px wide and scale in from 0.88 over 0.35s. All motion uses one spring, `cubic-bezier(0.16, 1, 0.3, 1)`, and is removed under reduced-motion.

### Step Rank
The signature component: the wizard's five steps as one rank of a chessboard, 60px tall with 8px corners and the Raised shadow. Squares alternate between the two Rank colours, each with its own 22px line icon (Items a receipt, People, Extras sliders, Review a checklist, Share) above a 12px label; the pawn rides as a small badge in the corner of the green square. A Brand Green square carrying a pawn slides to the current step over 0.45s, and on Share the pawn promotes to a queen with a small pop. The pieces are inline SVG from `src/components/Poster.tsx`.

### Scene Header
A full-bleed image from the generated set, day or night, with a smaller file under 900px. The title and total sit in the upper sky, with the date and details line beneath them. The image sits at a page-specific vertical position and ends in two rows of squares that dissolve it into the page.

### Share Card
The link preview at 1200 by 630, a friend's first contact with the product. A pale cloud sky fills the card with the meadow along the bottom, without the computer so nothing pokes out from behind the receipt. On the left, in Deep Forest: the logo and name, the bill title in poster caps (58, 46 or 36px by length), then the date and details line, then a one-line prompt. On the right, a 456px white paper receipt with 12px top corners and a scalloped bottom edge holds the total in Text Green poster type, overlapping avatars, names and a 64px Brand Green call to action.

## Do's and Don'ts

### Do:
- **Do** generate any new artwork with `scripts/make-art.py`, in day and night versions, and keep the provenance file beside each shipped raster.
- **Do** put poster type in the clear upper sky and keep amounts people act on in cards on solid panels.
- **Do** use dark text #04261a on Brand Green #00b368.
- **Do** end every page in the meadow and run the nav bar solid across the full width.
- **Do** place the date and details line under the title and total.
- **Do** keep touch targets at 44px or larger and set every amount in tabular figures.
- **Do** ship every new surface in both day and night.
- **Do** use `cubic-bezier(0.16, 1, 0.3, 1)` for all motion and let reduced-motion remove it.

### Don't:
- **Don't** reuse or trace the reference campaign's images. Take its language, and draw everything from code.
- **Don't** add `backdrop-filter`, CSS blur or frosted surfaces to the interface.
- **Don't** put white text on Brand Green, or use Brand Green itself as text.
- **Don't** use red in the interface for anything but negative amounts and errors.
- **Don't** add a shadow to a card that is not floating.
- **Don't** float the navigation as a pill or make it translucent.
- **Don't** set running text in the poster face or place a small line above a bill title.
- **Don't** let the scene follow people into the working area: below the header, surfaces stay calm and solid.

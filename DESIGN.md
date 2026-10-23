---
name: KingIdentity Audit
description: A calm Fluent workspace for inspecting recorded identity evidence and preparing owner reviews.
colors:
  brand: "var(--colorBrandBackground, #0f6cbd)"
  brand-foreground: "var(--colorBrandForeground1, #0f6cbd)"
  surface: "var(--colorNeutralBackground1, #fff)"
  surface-secondary: "var(--colorNeutralBackground2, #f4f6f8)"
  stroke: "var(--colorNeutralStroke1, #d1d1d1)"
  stroke-soft: "var(--colorNeutralStroke2, #e1e1e1)"
  text: "var(--colorNeutralForeground1, #242424)"
  text-secondary: "var(--colorNeutralForeground2, #616161)"
  text-tertiary: "var(--colorNeutralForeground3, #707070)"
  danger: "var(--colorPaletteRedForeground1, #bc2f32)"
  warning: "var(--colorPaletteDarkOrangeForeground1, #da3b01)"
  focus: "var(--colorStrokeFocus2, #000)"
  local-status: "#107c10"
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "clamp(25px, 3vw, 31px)"
    fontWeight: 650
    lineHeight: 1.16
    letterSpacing: "-.04em"
  title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-.02em"
  body:
    fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "14px"
  evidence:
    fontSize: "12px"
    lineHeight: 1.65
  path:
    fontSize: "13px"
    lineHeight: 1.5
  kicker:
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: ".11em"
rounded:
  field: "4px"
  compact: "6px"
  navigation: "7px"
  context: "8px"
  panel: "9px"
spacing:
  tight: "4px"
  small: "8px"
  control: "10px"
  compact: "12px"
  section: "16px"
  workbench: "18px"
  panel: "20px"
  page: "24px"
  wide: "32px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "20px"
  access-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  coverage-disclosure:
    backgroundColor: "{colors.surface-secondary}"
    rounded: "{rounded.field}"
    padding: "14px"
  navigation:
    rounded: "{rounded.navigation}"
    height: "42px"
---

# Design System: KingIdentity Audit

## Overview

**Creative North Star: "The Identity Evidence Workbench"**

KingIdentity uses a light enterprise workspace: Segoe typography, Fluent blue actions, white panels, restrained separators and compact evidence rows. The hierarchy helps administrators select an identity, follow recorded relationships and prepare a review while keeping source context and uncertainty visible.

This document captures the built interface in `src/App.jsx`, `src/views/EnterpriseViews.jsx`, `src/views/AccessWorkbench.jsx` and `src/styles.css`, with the final Access Explorer and employee review captures under `.impeccable/review/access/`. `design-system/MASTER.md` remains the incumbent authority. Fluent UI React v9 under `FluentProvider` with `webLightTheme` supplies the component foundation. The descriptive name above summarizes that existing system; it does not establish a new identity. These observations document presentation, not live integration verification.

**Key Characteristics:**

- Calm light surfaces and one blue action accent.
- Compact operational hierarchy with explicit evidence labels.
- Bordered panels, flat evidence lists and limited shadow.
- Responsive forms and labeled table cells that retain context.
- Source, capture time and limitations placed near evidence.

## Colors

The palette follows Fluent semantic roles. Frontmatter preserves the CSS variable expressions and their source fallbacks; the active Fluent provider remains authoritative for resolved component colors. CSS aliases declared on the root and variables provided by Fluent have different scopes, so use the existing aliases for custom layout and Fluent tokens for library controls.

### Primary

- **Fluent Action Blue** (`brand`): primary actions, current navigation and active workspace buttons.
- **Fluent Link Blue** (`brand-foreground`): links, small informative accents and contextual icons.

### Neutral

- **Workspace White** (`surface`): navigation, panels and fields.
- **Context Gray** (`surface-secondary`): page background, coverage disclosures, identity context and supporting callouts.
- **Control Stroke** (`stroke`): input and select borders.
- **Quiet Divider** (`stroke-soft`): panel outlines and row separators.
- **Primary Ink**, **Supporting Ink** and **Metadata Ink** (`text`, `text-secondary`, `text-tertiary`): content, explanation and smaller operational metadata respectively.
- **Focus Ink** (`focus`): the global keyboard focus outline.

### Semantic signals

Danger and warning foregrounds accompany high and moderate signals. Fluent Badge and MessageBar intent variants supply their own semantic surfaces. Local status green accompanies visible local/session or enabled-state text; it is not a general assurance indicator.

**The Labeled Signal Rule.** Every severity, coverage and review state needs visible text; color supplements its meaning.

## Typography

The interface uses Segoe UI with system fallbacks. Code examples and identifier blocks use the existing Consolas/Cascadia Code monospace stack or native code rendering. Keep Fluent's typography defaults for Fluent controls.

- **Headline:** the fluid page heading in frontmatter; compact enough to share a desktop heading row with actions.
- **Title:** panel titles use the frontmatter title role. Access context headings use (15px); generic access subsection headings also inherit the existing browser/Fluent heading cascade, so do not impose a new universal heading scale.
- **Body:** the stylesheet body is (14px). The incumbent MASTER preference for (16px) body text is an aspiration for future work, not a claim that all existing copy uses it.
- **Evidence:** source explanations and notes use the smaller evidence role; recorded chains use the path role. Supporting Access paragraphs use line height (1.6), with introductory text limited to (72ch).
- **Label:** access form labels inherit the body scale with weight (600), then field contents return to weight (400). Small uppercase kickers distinguish structural metadata.
- **Numbers:** overview metrics use tabular numerals with large, tight figures; they remain operational counts.

**The Evidence Proximity Rule.** Keep a recorded relationship's source, basis, capture time and limitations beside that relationship.

## Layout

The implemented desktop shell is a two-column grid: a sticky rail (248px) and a flexible workspace. A top bar (58px) precedes a centered page container capped at (1500px), with desktop padding (32px 40px 24px). At (1120px) the rail narrows to (218px), side padding becomes (26px) and summary metrics become two columns. At (860px) the rail becomes an icon rail (72px), while overview/source layouts stack.

At (640px) the shell becomes a document flow: the brand sits above a horizontally scrollable navigation row, the top bar becomes (45px), page padding becomes (24px 15px 18px), and page actions share the row width. Native tables become stacked records with each cell's `data-label` displayed above its value. The minimum document width is (320px). Preserve field labels and evidence content during reflow.

Access uses a single panel flow with section gaps (18px). The search/person picker has columns in a (1:2) relationship with minimums (180px/240px). Employee review fields use (2:1:1); assignment decisions and device/activity context use two columns. At (760px), those structures and the captured identity definition list become single columns. Action groups wrap; access export actions become full-width. The captured identity definition list uses label/value columns on larger screens and wraps long IDs anywhere.

MASTER describes a general twelve-column content vocabulary; the built surfaces currently use the explicit grids above. Extend their established proportions instead of forcing an unseen twelve-column implementation. Print CSS removes the rail, top bar, action/tool bars and footer, flattens layout and preserves evidence surfaces; this is a source description, not a claim of a fresh print verification.

## Elevation & Depth

Panels and metric cards have a minimal shadow (`0 1px 2px rgb(0 0 0 / 3%)`); soft borders provide most grouping. The brand mark alone has a small blue ambient shadow. Evidence rows remain flat and are separated by strokes. Coverage, confirmation and contextual evidence use a secondary surface, without floating card stacks. Motion stays with Fluent interaction feedback; the global reduced-motion query shortens transitions and animations and disables smooth scrolling.

## Shapes

Panels have gentle corners; fields and disclosure boxes are squarer. Navigation and context surfaces sit between those shapes. Use the frontmatter corner roles rather than making every surface a pill. Small status dots are circular; informational badges keep Fluent's own shape and sizing. Do not replace the existing Fluent focus, hover or disabled behavior with decorative effects.

## Components

- **Buttons:** use Fluent `Button` appearances. Primary identifies consequential workspace actions such as creating a case and exporting a review package; standard secondary controls support restore/export actions; subtle buttons switch inactive access workspaces. Keep disabled states and visible action labels. Page action buttons have a minimum height (38px); access fields also have a minimum height (38px).
- **Navigation:** one current rail action uses primary blue. At tablet width, icons retain accessible names; on phones, text labels return in the horizontal row. Access workspace switches are a named button group with `aria-pressed`, rather than an undocumented tab widget.
- **Fields:** access search, select, date, notes and decision controls use native labeled elements, neutral surfaces, fine borders and compact corners. Focus is an offset blue outline (2px); the global outline uses focus ink. Textareas resize vertically and use comfortable line spacing.
- **Panels:** bordered white containers organize a whole task. Desktop padding is (20px), becoming (15px) on phones. Assignment rows inside them use bottom separators and vertical padding (18px), without another nested card surface.
- **Badges and messages:** outline badges name entitlement kind and read-only evidence; tinted badges show review state. Warning MessageBars mark fictional or restored evidence. Errors appear near the workspace controls through an error MessageBar. Use Fluent intent variants rather than custom duplicate semantics.
- **Recorded path:** an ordered list wraps along the available width; arrow separators express direction. The row heading carries kind, assignment label and source. Beneath it sit basis, scope, capture time and a native disclosure for identifiers and limits. Long identifiers wrap instead of widening the page.
- **Coverage disclosure:** a bordered secondary surface contains a native details/summary, coverage table and limitations. The captured review context uses the same disclosure language, then a definition list and device/activity sections. Frozen captured data is visually identified as captured evidence.
- **Employee review:** owner, due date and status precede a visible completion explanation; checklist, notes, assignment decisions and reasons follow. Status text, demonstration/restored warnings and export sensitivity copy stay in the review's reading flow. This documents the rendered controls without asserting a completed business approval.
- **Empty states:** concise title and explanation tell operators which evidence or action is missing. Keep uncertainty explicit when no relationships or activity were returned.

## Do's and Don'ts

### Do:

- Do preserve Fluent UI v9, Segoe typography and the light enterprise workspace.
- Do retain source, capture time and limitations beside recorded evidence.
- Do keep labels visible when forms and evidence records stack on narrow screens.
- Do use semantic state text alongside color and preserve keyboard focus visibility.
- Do reuse flat assignment rows and native disclosures inside the parent task panel.

### Don't:

- Don't present empty evidence as proof that access or activity does not exist.
- Don't hide source identifiers, review uncertainty or synthetic/restored warnings to simplify the layout.
- Don't substitute decorative charts or assurance scores for operational evidence.
- Don't introduce a second component theme or a new font family for the Access extension.

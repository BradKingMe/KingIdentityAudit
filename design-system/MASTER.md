# KingIdentity interface system

## Product frame

- Audience: identity administrators and security reviewers responsible for on-premises and cloud enterprise systems.
- Job: understand account state and access relationships, inspect source evidence, investigate common identity problems, and prepare safe next steps.
- Trust rule: show the source, timestamp, scope, limits, and data quality beside findings.
- No overall security score. Counts describe matched review signals, not breach likelihood.
- Current preview: AD DS snapshot collection, optional read-only Entra ID and Intune Graph collection, directory inventory, cross-source identity profiles, access investigation, snapshot comparison, and local guided review plans. Microsoft 365, HR, and asset sources are not connected.
- Product shape: one workspace with separate, opt-in connectors and a common evidence model. Never imply that an unconnected source was checked.

## Component foundation

- Use Fluent UI React v9 components under `FluentProvider` with `webLightTheme`.
- Use Fluent semantic tokens for color, focus, typography, and surfaces. Custom CSS handles page layout only.
- Use Fluent UI React icons from one icon family. Every icon-only control needs an accessible name.
- Use native semantic tables for directory and finding rows; keep headers visible and sortable controls labeled.

## Layout and hierarchy

- Desktop: compact left rail, a clear page header, then a 12-column content grid.
- Tablet: rail collapses to icon plus text-on-hover only where keyboard and accessible names remain available.
- Phone: navigation becomes a horizontally scrollable row; content and tables reflow without hidden fields.
- Keep review evidence near the finding title. Place remediation guidance after evidence and caveats.
- Keep overview summary to four operational counts and a short priority queue; do not add a decorative chart.

## Visual language

- Calm, high-contrast enterprise surfaces with one Fluent blue action color.
- Severity always includes a text label; color is supplementary.
- High severity uses the Fluent danger token, moderate uses warning, review uses informative, and inventory uses neutral.
- Prefer 8px spacing steps, 16px body type, restrained borders, and visible focus states.
- Motion is limited to Fluent interaction feedback; respect `prefers-reduced-motion`.

## Data and interaction

- Sample data is clearly labeled synthetic.
- Imported snapshots stay in page memory; import does not send data to a service or persist it in browser storage.
- Show validation errors next to the import flow; never render imported strings as HTML.
- Print layout removes navigation and controls while preserving scope, evidence, caveats, and source links.

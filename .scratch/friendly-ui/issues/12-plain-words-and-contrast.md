# Plain words on the Dashboard, and readable contrast

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)

## What to build

- **Dashboard wording:**
  - Background-call statuses read "Up to date", "Updating…" and "Couldn't update — Retry".
  - The sections are titled "How the Characters feel", "How they've changed" and "Where the story is".
  - No internal words ("judge", "extraction", "Done") remain anywhere in the UI.
- **Contrast pass:**
  - Every text colour and background pair in the app meets WCAG AA: 4.5:1 for body text, 3:1 for large text and icons.
  - Muted text and disabled states are raised wherever they fall short.
  - Destructive buttons use the danger style, are quieter than primary actions, and always confirm.

## Acceptance criteria

- [x] A Playwright check that none of "judge", "extraction" or "Done" appears as visible text on the Dashboard page.
- [x] Each colour pair and its measured ratio is listed in this ticket's Comments.
- [x] The existing dashboard e2e spec is updated.
- [x] The full suites pass.

## User stories covered

72–74.

## Comments

**Built (ticket 12 session, 2026-11-05)** on branch `claude/friendly-ui-12-words-contrast-fa1a59`. Not merged into master.

- **Dashboard** (`components/chat/dashboard.tsx`):
  - Three sections in the spec's order: "How the Characters feel" (each Character's Bonds with their history), "How they've changed" (each Character's Arc) and "Where the story is" (the Scene). Each Character is a named region inside the first two.
  - A fourth section, "Updates", holds the background status of recent replies. Each reply reads one plain status: "Up to date", "Updating…", or "Couldn't update — Retry". A failure wins over a pending call.
  - One Retry reruns whichever of the reply's calls failed: Bonds, Arcs and Scene first, then Memories.
  - The raw failure reasons are no longer shown. They were written by the API for the log and could name "the judge" or "the extraction".
- **Other wording:**
  - The Chat's blocked-sending notices read "Sending is paused: the Characters' feelings and the Scene couldn't update after the last reply." and "Sending is paused: Memories couldn't update after the last reply.", each with Retry.
  - The API's three background-call errors (`409.004.008`–`010`) are reworded, because the Chat and the Dashboard show their messages as they come. For example, `409.004.008` now reads "The Memories couldn't update after the previous turn. Retry before sending." The codes are unchanged.
  - The Memory drawer's "Done" button stays. It is a close label, not a status, and it isn't on the Dashboard.
- **Contrast:**
  - Every pair was measured with `.scratch/friendly-ui/contrast-check.mjs` (`node .scratch/friendly-ui/contrast-check.mjs before|after [--fail]`). The script uses WCAG relative luminance, composites translucent layers over what's under them, and applies an element's opacity to both its fill and its text.
  - New `:root` tokens:
    - `--accent-fill` (#7357ec) is the fill under white text. `--accent` stays for accent text and icons on the dark surfaces; no single purple can be both light enough for those and dark enough under white text.
    - `--faint` (#8e85a8) is for disabled text and icons.
  - Changed token: `--muted` rises from #a59cbd to #b4abcb.
  - `offline.html` mirrors `--muted` and `--accent-fill`, the ones it uses.
  - **Disabled states** no longer fade with opacity:
    - Disabled buttons (global `.button`, the sheet's primary, the editor's Play) take the raised fill with muted text.
    - Disabled menu rows, the Add buttons and the disabled ⚡ take `--faint`.
  - **Destructive buttons:**
    - `.button-danger` is the danger fill (`--danger-soft`) with `--danger-text`, at weight 500. It is quieter than the accent button.
    - The Delete and Remove triggers (Chat, Memory, Persona, Snapshot, Character, Scene, Reference image) now use it.
    - Every confirmation is unchanged. The Story assistant's "Undo" trigger stays quiet: it undoes a change, and its "Remove" confirmation is in the danger style.
  - **Other fixes:**
    - Links inside a `.notice` are text-coloured, matching `.banner a`.
    - The cover badge's backdrop is 78% black (was 65%), measured over a white cover as the worst case.
    - The reduced-motion writing dots rest at 0.75 opacity (was 0.6).
    - The Snapshot placeholder's pulse bottoms out at 0.75 (was 0.55).

**Colour pairs.** The table lists 86 pairs. 14 fell short before; none do now. "Same" means the pair didn't change. Ratios are WCAG contrast ratios. The minimum is 4.5:1 for text and 3:1 for icons. Hairlines, borders and the sheet's grip are decorative and are not listed.

| Pair | Min | Before | After |
| --- | --- | --- | --- |
| Body text on page (`#ece8f6` on `#16131f`) | 4.5:1 | 15.20 | same |
| Body text on surface (`#ece8f6` on `#221d30`) | 4.5:1 | 13.56 | same |
| Body text on raised surface (`#ece8f6` on `#2c2540`) | 4.5:1 | 12.06 | same |
| Muted text on page (`#a59cbd` on `#16131f`) | 4.5:1 | 7.05 | 8.39 (`#b4abcb` on `#16131f`) |
| Muted text on surface (`#a59cbd` on `#221d30`) | 4.5:1 | 6.29 | 7.48 (`#b4abcb` on `#221d30`) |
| Muted text on raised surface (disabled send, reason) (`#a59cbd` on `#2c2540`) | 4.5:1 | 5.60 | 6.66 (`#b4abcb` on `#2c2540`) |
| Accent text/links on page (`#8f73ff` on `#16131f`) | 4.5:1 | 5.29 | same |
| Accent text/links on surface (`#8f73ff` on `#221d30`) | 4.5:1 | 4.71 | same |
| Primary button text on accent (.button, send, Play, segmented) (`#ffffff` on `#8f73ff`) | 4.5:1 | 3.46 **short** | 4.88 (`#ffffff` on `#7357ec`) |
| Warning text on page (`#ffc46b` on `#16131f`) | 4.5:1 | 11.65 | same |
| Warning text on surface (`#ffc46b` on `#221d30`) | 4.5:1 | 10.39 | same |
| Warning text on warning box (`#ffc46b` on `#3a2a12`) | 4.5:1 | 8.79 | same |
| Danger text on surface (Reset Chat row) (`#ff7a8a` on `#221d30`) | 4.5:1 | 6.53 | same |
| Danger link on the page (Delete Story) (`#ff7a8a` on `#16131f`) | 4.5:1 | 7.33 | same |
| Danger button text on danger fill (`#ffd5db` on `#5a1f2b`) | 4.5:1 | 9.48 | same |
| Legacy .button-danger: white on #8a2d3b (`#ffffff` on `#8a2d3b`) | 4.5:1 | 8.34 | 9.48 (`#ffd5db` on `#5a1f2b`) |
| User bubble text on accent tint (`#ece8f6` on `#2c2447`) | 4.5:1 | 12.00 | same |
| Accent on accent tint (⚡ pressed) (`#8f73ff` on `#2c2447`) | 3:1 | 4.17 | same |
| Selected tab text on accent tint (`#ece8f6` on `#2c2447`) | 4.5:1 | 12.00 | same |
| Assistant change link on accent tint over surface (`#ece8f6` on `#362c55`) | 4.5:1 | 10.54 | same |
| Assistant change link icon on accent tint (`#a59cbd` on `#362c55`) | 3:1 | 4.89 | 5.82 (`#b4abcb` on `#362c55`) |
| Needed mark on warning tint over surface (`#ffc46b` on `#413235`) | 4.5:1 | 7.70 | same |
| Text on warning box (status box, assistant removals) (`#ece8f6` on `#3a2a12`) | 4.5:1 | 11.47 | same |
| Status box list item on dark tint over warning box (`#ece8f6` on `#2e220e`) | 4.5:1 | 12.93 | same |
| Status box toggle #ffe2b8 on warning box (`#ffe2b8` on `#3a2a12`) | 4.5:1 | 11.07 | same |
| Status box OK #bfeccc on #15301f (`#bfeccc` on `#15301f`) | 4.5:1 | 10.91 | same |
| Quiet button text on #3a3150 (`#ece8f6` on `#3a3150`) | 4.5:1 | 10.05 | same |
| Pill / chip muted on #3a3150 (`#a59cbd` on `#3a3150`) | 4.5:1 | 4.66 | 5.55 (`#b4abcb` on `#3a3150`) |
| Pill OK #9be7c4 on #1f4d3a (`#9be7c4` on `#1f4d3a`) | 4.5:1 | 6.70 | same |
| Banner text on #4a2a12 (`#ece8f6` on `#4a2a12`) | 4.5:1 | 10.69 | same |
| Warning-text #f3b26b on #4a2a12 (`#f3b26b` on `#4a2a12`) | 4.5:1 | 6.98 | same |
| Turn/field error #f3b26b on page (`#f3b26b` on `#16131f`) | 4.5:1 | 9.93 | same |
| Turn error #f3b26b on surface (dashboard) (`#f3b26b` on `#221d30`) | 4.5:1 | 8.85 | same |
| Notice text on #2d2742 (`#ece8f6` on `#2d2742`) | 4.5:1 | 11.78 | same |
| Rollback notice text on #23313a (`#ece8f6` on `#23313a`) | 4.5:1 | 11.09 | same |
| Toast text on #2b3a2e (`#ece8f6` on `#2b3a2e`) | 4.5:1 | 9.98 | same |
| Toast detail muted on #2b3a2e (`#a59cbd` on `#2b3a2e`) | 4.5:1 | 4.63 | 5.51 (`#b4abcb` on `#2b3a2e`) |
| Event #d9c48a on page (`#d9c48a` on `#16131f`) | 4.5:1 | 10.65 | same |
| Event #d9c48a on surface (`#d9c48a` on `#221d30`) | 4.5:1 | 9.49 | same |
| Confirm warning #f0c9a0 on surface (`#f0c9a0` on `#221d30`) | 4.5:1 | 10.55 | same |
| Gallery earlier #e0b36a on page (`#e0b36a` on `#16131f`) | 4.5:1 | 9.44 | same |
| Snapshot failed text on #3a2b2e (`#ece8f6` on `#3a2b2e`) | 4.5:1 | 11.14 | same |
| Viewer text #fff on black (`#ffffff` on `#000000`) | 4.5:1 | 21.00 | same |
| Viewer count/meta #bbb on black (`#bbbbbb` on `#000000`) | 4.5:1 | 10.94 | same |
| Viewer link #c9b9ff on black (`#c9b9ff` on `#000000`) | 4.5:1 | 11.87 | same |
| Viewer prompt #ddd on #1a1a1a (`#dddddd` on `#1a1a1a`) | 4.5:1 | 12.81 | same |
| Cover badge warning on 65% black over white cover (`#ffc46b` on `#595959`) | 4.5:1 | 4.44 **short** | 7.45 (`#ffc46b` on `#383838`) |
| Danger text on raised surface (Reset row pressed) (`#ff7a8a` on `#2c2540`) | 4.5:1 | 5.81 | same |
| Warning text on raised surface (`#ffc46b` on `#2c2540`) | 4.5:1 | 9.24 | same |
| Rewrite ✨ #c7b6ff on surface (`#c7b6ff` on `#221d30`) | 4.5:1 | 8.99 | same |
| Links in a notice: accent on #2d2742 (`#8f73ff` on `#2d2742`) | 4.5:1 | 4.10 **short** | 11.78 (`#ece8f6` on `#2d2742`) |
| Links in the rollback notice: accent on #23313a (`#8f73ff` on `#23313a`) | 4.5:1 | 3.86 **short** | 11.09 (`#ece8f6` on `#23313a`) |
| Snapshot placeholder text at its faintest pulse (opacity .55) (`#655e76` on `#1d1928`) | 4.5:1 | 2.81 **short** | 4.80 (`#8d85a0` on `#1f1b2c`) |
| Writing dots at rest under reduced motion (opacity .6) (`#5f4da5` on `#16131f`) | 3:1 | 2.68 **short** | 3.50 (`#715bc7` on `#16131f`) |
| Disabled ⚡ icon (--line) on page (`#3a3150` on `#16131f`) | 3:1 | 1.51 **short** | 5.29 (`#8e85a8` on `#16131f`) |
| Writing dots accent on page (icon) (`#8f73ff` on `#16131f`) | 3:1 | 5.29 | same |
| Needs-attention dot warning on page (icon) (`#ffc46b` on `#16131f`) | 3:1 | 11.65 | same |
| Bottom nav current icon accent on page (`#8f73ff` on `#16131f`) | 3:1 | 5.29 | same |
| Disabled primary button (opacity .6) on page (`#a2a1a5` on `#5f4da5`) | 4.5:1 | 2.65 **short** | 6.66 (`#b4abcb` on `#2c2540`) |
| Disabled quiet button (opacity .6) on surface (`#9b97a7` on `#302943`) | 4.5:1 | 4.83 | 6.66 (`#b4abcb` on `#2c2540`) |
| Disabled menu item (opacity .5) on surface (`#878393` on `#221d30`) | 4.5:1 | 4.41 **short** | 4.72 (`#8e85a8` on `#221d30`) |
| Disabled menu item sub-line (opacity .5) on surface (`#645d77` on `#221d30`) | 4.5:1 | 2.60 **short** | 4.72 (`#8e85a8` on `#221d30`) |
| Disabled Add button muted (opacity .5) on surface (`#645d77` on `#221d30`) | 4.5:1 | 2.60 **short** | 4.72 (`#8e85a8` on `#221d30`) |
| Disabled Add button on page (`#5e586e` on `#16131f`) | 4.5:1 | 2.68 **short** | 5.29 (`#8e85a8` on `#16131f`) |
| Story sheet primary disabled (opacity .6) (`#a7a5ac` on `#6351ac`) | 4.5:1 | 2.60 **short** | 6.66 (`#b4abcb` on `#2c2540`) |
| Disabled Play (opacity .45) on page (`#7f7d84` on `#4c3e84`) | 4.5:1 | 2.22 **short** | 6.66 (`#b4abcb` on `#2c2540`) |
| Read-only field (opacity .6) on page (`#9b97a7` on `#1b1726`) | 4.5:1 | 6.16 | same |
| Story sheet secondary disabled (opacity .6) (`#9b97a7` on `#221d30`) | 4.5:1 | 5.73 | 7.48 (`#b4abcb` on `#221d30`) |
| Character colour #f2b766 on page (`#f2b766` on `#16131f`) | 4.5:1 | 10.24 | same |
| Character colour #f2b766 on surface (`#f2b766` on `#221d30`) | 4.5:1 | 9.13 | same |
| Character colour #5fd0c5 on page (`#5fd0c5` on `#16131f`) | 4.5:1 | 9.86 | same |
| Character colour #5fd0c5 on surface (`#5fd0c5` on `#221d30`) | 4.5:1 | 8.80 | same |
| Character colour #f08aa8 on page (`#f08aa8` on `#16131f`) | 4.5:1 | 7.76 | same |
| Character colour #f08aa8 on surface (`#f08aa8` on `#221d30`) | 4.5:1 | 6.92 | same |
| Character colour #8fc7ff on page (`#8fc7ff` on `#16131f`) | 4.5:1 | 10.27 | same |
| Character colour #8fc7ff on surface (`#8fc7ff` on `#221d30`) | 4.5:1 | 9.16 | same |
| Character colour #b5e07a on page (`#b5e07a` on `#16131f`) | 4.5:1 | 12.13 | same |
| Character colour #b5e07a on surface (`#b5e07a` on `#221d30`) | 4.5:1 | 10.81 | same |
| Character colour #d6a8ff on page (`#d6a8ff` on `#16131f`) | 4.5:1 | 9.51 | same |
| Character colour #d6a8ff on surface (`#d6a8ff` on `#221d30`) | 4.5:1 | 8.48 | same |
| Character colour #ffa07a on page (`#ffa07a` on `#16131f`) | 4.5:1 | 9.21 | same |
| Character colour #ffa07a on surface (`#ffa07a` on `#221d30`) | 4.5:1 | 8.21 | same |
| Character colour #7fe0a0 on page (`#7fe0a0` on `#16131f`) | 4.5:1 | 11.40 | same |
| Character colour #7fe0a0 on surface (`#7fe0a0` on `#221d30`) | 4.5:1 | 10.16 | same |
| Character colour #c4bdd6 on page (`#c4bdd6` on `#16131f`) | 4.5:1 | 10.11 | same |
| Character colour #c4bdd6 on surface (`#c4bdd6` on `#221d30`) | 4.5:1 | 9.01 | same |

**Verified:**
- **Playwright, `e2e/dashboard.spec.ts`:**
  - The existing test now finds the Bond under "How the Characters feel", the Arc under "How they've changed", "Free play" under "Where the story is", and "Up to date" for Reply 2.
  - It checks that "judge", "extraction" and "Done" are not visible text on the Dashboard page, both before and after a Bond's history is opened.
  - A new test scripts a failed update: the reply reads "Couldn't update — Retry", Retry turns it to "Up to date", the Retry button goes, and still no internal word shows.
- **API:** `test/memory.spec.ts` asserts the reworded `409.004.008` messages.
- `npm run typecheck` is clean.
- `npm run test:api`: 302 passed (22 files).
- `npm run test:e2e`: 51 passed (ports 3531/3532).
- `/code-review` against master ran on two axes, standards and spec. These fixes came from it:
  - links in notices
  - the reduced-motion dots and the placeholder pulse
  - the API error wording
  - a clearer status helper with one label map

**Not done / notes:**
- **Not checked by hand:** the screens on the real Android phone, and the contrast with a second checker. Both are by hand, per the spec.
- **Line width:** some new lines are wider than `.prettierrc`'s 100 columns. The touched files were already over that on master, so they weren't reformatted.
- **Global stylesheet:** `.notice a` is a new rule in `globals.css`. It sits beside the global `.notice` it fixes.
- **Out of scope:** input boundaries (WCAG 1.4.11, non-text contrast of field borders) weren't measured. That pass covered text and icons.

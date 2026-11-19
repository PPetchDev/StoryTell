# Spec: Reading in the Visual novel view

Status: ready-for-agent

## Problem Statement

On the user's 360px phone (screenshot, 2026-11-19), the Visual novel view gave the story about a quarter of the screen:
- The top bar, the Character row, the composer's tool row and its box took the rest.
- The line sat in a small box under the stage, so a longer line had to be scrolled to read.
- A tap on the large picture opened the Character's profile, so a tap meant to go on often opened a sheet instead.

## Solution

- **The composer is put away while reading** (the user, 2026-11-19: hide the menus, bring them out on a tap, icons only).
  - In the novel view the whole composer is out of sight, and so is the Scene strip; the Chat menu still opens the Chapters. The top bar's Novel toggle shows its icon only.
  - A round ✎ "Write a message" at the stage's top right brings the composer out, the box focused.
  - Out, its tools and the Character row show as icons only; each keeps its name for screen readers and as a title.
  - A ⌄ "Hide the composer" beside the box puts it away again, and so does a send.
  - It stays out, even when hidden is asked for, while there is a draft, a panel is open, a Cue or Roll is set, or Write for me or Dictation is running.
- **The box lies over the foot of the stage**, as a visual novel's does.
  - The picture fills the whole stage, so the Character is larger.
  - The box is translucent, grows with its line up to 58% of the stage (40% on a PC), and scrolls only past that.
- **One row of controls in the box:** a round 44px Back arrow, the step's tools, then a round Next arrow.
  - The tools are round 44px icons, each with its name for screen readers and as a title: ▶ Read aloud, and on the newest reply's last step ↺ Again, 📷 Snapshot, ▶ Read aloud and ☰ Edit in thread (the user, 2026-11-19: the labelled Read aloud pill was too big).
  - Edit in thread has its own ☰ icon, so it isn't mistaken for the stage's ✎ Write a message.
  - Six round buttons fit a 360px phone on one row; the row still scrolls sideways when a version switch makes it longer.
- **A tap anywhere on the stage steps on, the picture included.** The speaker's name in the box opens their profile (dotted underline, "Profile of Mira").

## Testing Decisions

- e2e `visual-novel.spec.ts`, at 360px:
  - the composer and the Scene strip are hidden until ✎; ✎ focuses the box; its tools are icons that keep their names; a draft keeps it out, an empty box lets it go;
  - the box lies inside the foot of the stage;
  - a tap on the picture steps on and opens no profile;
  - nothing scrolls sideways;
  - the name opens the profile.

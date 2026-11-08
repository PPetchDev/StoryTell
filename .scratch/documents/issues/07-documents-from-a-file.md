# 07 — A Document from a .txt or .md file

**Status:** ready-for-agent

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Files and web pages": the Add Document sheet gets "Load a .txt or .md file", read in the browser with no upload route and no new dependency.
- It refuses a file over 1 MB or of another type before reading it, and text that doesn't decode as UTF-8 with "Couldn't read this file as text".
- It fills the text box and takes the title from the file name without its extension. The author trims and taps Add as for pasted text, with the source `file` and the file name kept as `sourceName`; only Add spends.
- The Document's card shows the file name as its source.

**Blocked by:** [02 — Add a pasted Document to a Story](02-add-pasted-documents.md)

- [ ] The picker accepts only .txt and .md; over 1 MB, another type and non-UTF-8 text each show their message in the sheet and fill nothing.
- [ ] API test: a Document added with `source: 'file'` and a `sourceName` answers them on the Story response.
- [ ] e2e at 390px: load a .txt file through the picker, see the title and text filled, add it, and see its card show the file name after a reload.
- [ ] No new npm dependency, and the existing suites stay green.

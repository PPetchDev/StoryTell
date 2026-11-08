# 02 — Import a PNG Character card with its picture

**Status:** done

**What to build:** PNG cards import too, and their picture becomes the Character's Reference image and the Story's Cover (spec: "Reading a card", "The mapping"). The card PNG codec starts here: it checks the signature, walks the chunks, reads `tEXt` chunks by keyword ignoring case, and strips chunks; `ccv3` is preferred over `chara`, and its base64 is decoded as UTF-8. A PNG without either is `NoCardInPictureError`. The picture is the card's own PNG with every `tEXt`, `zTXt` and `iTXt` chunk removed, stored through the existing Reference image write with no Portrait crop, and the Cover is set to that Character. Writing the picture and setting the Cover join the import's own cleanup from ticket 01: a failure after the file was written deletes the Story and that file, even when the file is not yet recorded on the Character. A V3 JSON card whose main icon asset is a `data:` URL of a PNG, JPEG or WebP gets that picture the same way; a URL is never fetched. On Home, a picked PNG shows its picture in the panel (from the file, in the browser).

This ticket also proves the 15 MB limit through the web's `/api` proxy, which no upload that large has crossed (Covers are cut to 2,048 px JPEGs before upload; a card can't be). If the proxy refuses a body under 15 MB, raise the proxy's limit or lower the card limit to what passes, and update the spec's "Upload" line.

**Blocked by:** [01 — Import a JSON Character card into a new Story](01-import-a-json-card.md)

- [x] Pure tests: reading a test-built PNG with `chara` only, `ccv3` only and both (V3 wins); keywords in another case; a Thai name through base64; a PNG with no card chunk; a truncated PNG; the stored picture has no text chunks and the same image data chunks.
- [x] API tests: a PNG card makes a Story whose Character has a Reference image (a PNG file under the Story's reference images), no Portrait crop, and is the Cover; a JSON V3 card with a `data:` icon gets the picture; one with an `https:` icon gets none and makes no request; a failure after the picture was written deletes the file and the Story.
- [x] e2e (390px): pick a PNG card on Home; the panel shows its picture; after import, the editor shows the Character's Portrait and Home's card shows the Cover; a plain PNG photo is refused in the panel with "Choose another file".
- [x] e2e: a PNG card of about 14 MB (built by the test) imports through the web; a 16 MB one shows `CardTooLargeError`'s message in the panel, not a proxy error.

**Notes (done 2026-11-08):** The proxy did cut a 14 MB body short: Next's rewrite buffers bodies only up to `experimental.proxyClientMaxBodySize`, 10 MB by default. `apps/web/next.config.ts` raises it to 20 MB, and the spec's "Upload" line says so. The Reference image write (`StoryManagerService.replaceReferenceImage`) now deletes its new file itself when the Character can't record it.

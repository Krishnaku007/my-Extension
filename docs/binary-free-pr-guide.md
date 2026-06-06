# Binary-free pull request guide

Some review systems and classroom platforms reject pull requests containing binary files. This repository keeps source-controlled assets text-only so the PR can be reviewed anywhere.

## What changed

- PNG icon files are intentionally excluded from source control.
- SVG icon source files remain in `assets/` because they are plain text and easy to review.
- `manifest.json` does not declare extension icons in the binary-free repository version, so Chrome will use its generic extension icon during local development.

## Why icons are not declared as SVG

Chrome extension manifest icons cannot use SVG files. Keep SVG files as editable source artwork, then export PNG files only when packaging a release outside a binary-restricted PR workflow.

## Generate PNG icons for a release package

Before publishing to the Chrome Web Store, export PNG files locally from the SVG source artwork and add an `icons` block to the packaged release manifest.

Recommended release icon sizes:

- `assets/icon16.png`
- `assets/icon48.png`
- `assets/icon128.png`

Example manifest release snippet:

```json
"icons": {
  "16": "assets/icon16.png",
  "48": "assets/icon48.png",
  "128": "assets/icon128.png"
}
```

Do not commit those generated PNG files if your PR platform rejects binary files. Keep them in the final ZIP package only.

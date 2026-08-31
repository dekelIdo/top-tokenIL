# ZuzCOINS: brand and asset specification

What the brand is, what art exists, and exactly what a designer or illustrator
needs to produce to replace the temporary pieces.

## The name

**ZuzCOINS**, always in that casing. It resolves from `src/app/core/brand/brand.ts`
and nothing else in the application hard-codes it, so a rename is one file.

"זוז" is an ancient Hebrew silver coin and also the Hebrew verb *to move*. The
brand leans on both: value, and getting it to the customer quickly. That is where
the tagline comes from and why the mark is a coin caught mid-turn rather than a
coin lying flat.

### A naming risk that needs a human decision

[Zucoins](https://zucoins.com/) is an active Australian cryptocurrency company
founded in 2018, with exchange listings and the `zucoins.com` domain. **ZuzCOINS**
differs by one letter and sounds nearly identical.

The sectors differ, which reduces trademark exposure, but both trade on "coins"
in a digital-value context, and it works against the stated goal of *not* reading
as crypto. Anyone searching the name will probably find them first.

This is not a legal opinion. Before any money is spent on printed material,
packaging or paid acquisition, someone should run a trademark search and check
domain availability. The centralised brand configuration exists so that changing
the name later costs one file rather than a second redesign.

## The palette

Defined in `src/styles/_tokens.scss`. Three ideas:

| Role | Token | Why |
|---|---|---|
| Ground | `--tt-bg` `#0B0A12` | A violet-black, not a neutral grey. Gaming products live on dark surfaces, and the cast keeps it from reading as a developer's default. |
| Interaction | `--tt-brand-500` `#6D4AFF` | Everything a customer can press. |
| Value | `--tt-gold-500` `#F5B942` | Prices, coin products, discounts. Gives a price authority and ties to "coins" without drawing one next to every number. |

Green was deliberately dropped as the primary. Dark plus neon mint is the house
style of every crypto exchange, which is the one thing this brand must not look
like. Green survives only as "this worked".

## Assets that exist

| File | Purpose | Status |
|---|---|---|
| `src/assets/brand/logo-mark.svg` | The coin-and-Z mark | Production ready |
| `src/assets/brand/favicon.svg` | Tab icon on the brand ground | Production ready |
| `src/app/ui/components/brand-logo.component.ts` | Mark plus wordmark lockup, reads the name from configuration | Production ready |
| `src/app/ui/components/icon.component.ts` | 14 inline SVG icons | Production ready |
| `src/assets/products/*.svg` (8 files) | Product illustrations | **Temporary** |

The icons replaced the emoji the header previously used. Emoji render differently
on every platform, cannot be recoloured, sit on the wrong baseline, and are the
clearest possible signal that nobody designed the interface.

## Assets still needed

The eight product SVGs are flat, generic, and shared across every product of a
type: every coin bundle uses the same stack-of-coins drawing whether it is 100K
or 2M. They are legible and honest, and they are not what a premium storefront
looks like. They are marked temporary so a component does not need redesigning
when they are replaced.

### 1. Product illustrations (8 to 24 pieces)

| Property | Specification |
|---|---|
| Format | SVG preferred, WebP at 2x acceptable for raster |
| Canvas | 240 × 180, viewBox `0 0 240 180` |
| Aspect | 4:3, matching the card media area |
| Focal point | Centred, occupying 60 to 70 percent of the canvas height |
| Background | Transparent. The card supplies its own ground |
| Safe area | 16px inset on all sides; nothing important closer to an edge |
| Palette | Product-appropriate, but must sit on `#15121F` without a halo |
| Weight | Under 6 kB each |
| Lighting | Single source, upper left, soft shadow beneath |

One illustration per **product**, not per product type. The current sharing is
the main reason the catalog looks generated.

### 2. Game key art (5 pieces, one per game)

Used on the game cards and the game detail hero.

| Property | Specification |
|---|---|
| Format | WebP, with a JPEG fallback |
| Desktop | 1200 × 480 (5:2) |
| Mobile crop | 800 × 800 (1:1), a separate export rather than a CSS crop |
| Focal point | Marked in the filename, for example `ea-fc--focal-center-left.webp` |
| Treatment | Darkened enough that white text at `--tt-text` clears 4.5:1 |
| Weight | Under 120 kB desktop, under 60 kB mobile |

**Rights are the blocker here, not production.** Publisher key art for EA SPORTS
FC, Fortnite, Call of Duty and NBA 2K is copyrighted and cannot be used because
it looks good. Either license it, commission original art that evokes the genre
without reproducing protected work, or keep the current abstract per-game colour
treatment, which is original and already ships.

### 3. Social preview image

| Property | Specification |
|---|---|
| Format | PNG |
| Size | 1200 × 630 |
| Content | The lockup on the brand ground, plus the tagline |
| Safe area | 80px inset; some platforms crop to 1.91:1 |

`index.html` declares Open Graph tags but no image, so a shared link currently
shows text only.

### 4. Favicon raster fallback

`favicon.svg` covers modern browsers. A 32 × 32 and 180 × 180 PNG would cover
older ones and iOS home-screen bookmarks. `src/favicon.ico` still holds the
Angular default and should be replaced.

## Rules for whoever produces these

- No publisher logos, player likenesses, or key art we do not hold rights to.
- No stock photography of people wearing headsets.
- Anything temporary goes in `src/assets/products/` and is listed in this
  document, so it can be found and replaced.
- Nothing loads from an external host at runtime. Assets are local and versioned
  with the build.

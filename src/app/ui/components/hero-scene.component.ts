import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinTierComponent } from './coin-tier.component';

/**
 * The hero scene.
 *
 * The product artwork used to be a single SVG sitting in a box, which is why it
 * read as a sticker no matter how well the metal was drawn. An object only
 * looks physical when there is somewhere for it to be: light coming from a
 * direction, a surface underneath it, atmosphere between it and the camera.
 *
 * So this is a scene in four planes rather than one image:
 *
 *   1. Haze        a soft pool of warm light the object sits inside
 *   2. Shafts      two hard light beams raking down across it
 *   3. Ground      a horizon line, and the object's own reflection in it
 *   4. Motes       a few specks catching the light, in front of everything
 *
 * All of it is CSS and inline SVG. There is no raster artwork to download, no
 * image to go stale against the palette, and the whole thing recolours with the
 * theme. On a phone the shafts and motes are dropped: they are atmosphere, and
 * atmosphere at 360px is just noise over the headline.
 */
@Component({
  selector: 'tt-hero-scene',
  standalone: true,
  imports: [CommonModule, CoinTierComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene" aria-hidden="true">
      <span class="haze"></span>
      <span class="shaft shaft--a"></span>
      <span class="shaft shaft--b"></span>

      <div class="stage">
        <tt-coin-tier class="object" [tier]="tier"></tt-coin-tier>

        <!-- The same object, mirrored into the floor and faded out. This is the
             single cheapest thing that makes a rendered object look like it is
             standing on something. -->
        <tt-coin-tier class="mirror" [tier]="tier"></tt-coin-tier>
      </div>

      <span class="horizon"></span>

      <span class="mote mote--1"></span>
      <span class="mote mote--2"></span>
      <span class="mote mote--3"></span>
      <span class="mote mote--4"></span>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .scene {
      position: relative;
      isolation: isolate;
      display: grid;
      place-items: center;
      inline-size: 100%;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      /* Feathered at the edges. With a hard clip the haze and the shafts ended
         on a straight line and the whole scene read as a rectangle pasted onto
         the page, which is the exact opposite of the depth it is there to
         create. */
      -webkit-mask-image: radial-gradient(
        ellipse 78% 74% at 50% 48%,
        #000 55%,
        rgba(0, 0, 0, 0.55) 76%,
        transparent 96%
      );
      mask-image: radial-gradient(
        ellipse 78% 74% at 50% 48%,
        #000 55%,
        rgba(0, 0, 0, 0.55) 76%,
        transparent 96%
      );
    }

    /* A pool of warm light the object sits inside, not a glow stuck behind it. */
    .haze {
      position: absolute;
      inset-block-start: 8%;
      inline-size: 92%;
      block-size: 78%;
      border-radius: 50%;
      background: radial-gradient(
        ellipse at 50% 55%,
        rgba(242, 179, 61, 0.20),
        rgba(242, 179, 61, 0.06) 45%,
        transparent 70%
      );
      filter: blur(18px);
      z-index: -3;
    }

    /* Two rakes of light across the scene, cut on the brand's shear so even the
       lighting belongs to the identity. */
    .shaft {
      position: absolute;
      inset-block: -20%;
      inline-size: 22%;
      transform: skewX(-9deg);
      background: linear-gradient(
        180deg,
        rgba(255, 243, 210, 0.11),
        rgba(255, 243, 210, 0.03) 45%,
        transparent 78%
      );
      filter: blur(6px);
      z-index: -2;
      /* Feathered across their width too. A beam of light does not have a left
         edge, and with only the vertical fade these read as two pale
         rectangles standing in the sky. */
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, transparent);
      mask-image: linear-gradient(90deg, transparent, #000 45%, transparent);
    }
    .shaft--a { inset-inline-start: 14%; }
    .shaft--b { inset-inline-start: 52%; inline-size: 12%; opacity: 0.6; }

    .stage {
      position: relative;
      inline-size: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .object { inline-size: 100%; }

    .mirror {
      inline-size: 100%;
      margin-block-start: -14%;
      transform: scaleY(-1);
      opacity: 0.22;
      filter: blur(1.5px);
      -webkit-mask-image: linear-gradient(to top, transparent 12%, rgba(0, 0, 0, 0.9) 62%);
      mask-image: linear-gradient(to top, transparent 12%, rgba(0, 0, 0, 0.9) 62%);
      pointer-events: none;
    }

    /* The surface the object is standing on, stated with one line. */
    .horizon {
      position: absolute;
      inset-block-end: 22%;
      /* Narrower than the object and fading hard at both ends, so it reads as
         the light pooling under it rather than as a rule drawn across the
         page. At 78% it ran out past the artwork and looked like a stray
         divider. */
      inline-size: 46%;
      block-size: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 214, 133, 0.30) 40%,
        rgba(255, 214, 133, 0.30) 60%,
        transparent
      );
      z-index: -1;
    }

    /* Specks catching the light in front of the object, which is what puts a
       camera in the scene. Fixed positions: artwork that moves between renders
       reads as a fault, not as life. */
    .mote {
      position: absolute;
      border-radius: 50%;
      background: var(--tt-gold-300);
      filter: blur(0.4px);
    }
    .mote--1 { inset-block-start: 22%; inset-inline-start: 24%; inline-size: 3px; block-size: 3px; opacity: 0.5; }
    .mote--2 { inset-block-start: 62%; inset-inline-start: 79%; inline-size: 2px; block-size: 2px; opacity: 0.38; }
    .mote--3 { inset-block-start: 39%; inset-inline-start: 88%; inline-size: 4px; block-size: 4px; opacity: 0.22; }
    .mote--4 { inset-block-start: 74%; inset-inline-start: 12%; inline-size: 2px; block-size: 2px; opacity: 0.3; }

    /* On a phone the object is the point and the weather is not. Shafts and
       motes come off, the reflection stays: it is what keeps the object from
       floating. */
    @media (max-width: 900px) {
      /* A band across the top of the message. The object is sized to fit the
         band's height rather than its width: at full width a four-by-three
         drawing overflows a wide box and gets sliced through the middle, which
         is how the whole cluster came to be cropped top and bottom. */
      /* Short and wide. A sixteen-by-nine band pushed the price and the buy
         button off the first screen, which is a bad trade for a picture. The
         object is scaled up inside a shallower band and the empty margin at the
         top of its own drawing is what gets clipped, not the object. */
      .scene { aspect-ratio: 2.5 / 1; }
      .object { inline-size: 62%; }
      .mirror { inline-size: 62%; margin-block-start: -13%; opacity: 0.14; }
      .haze { inline-size: 70%; block-size: 96%; inset-block-start: 2%; }
      .horizon { inline-size: 34%; inset-block-end: 14%; }
      .shaft, .mote { display: none; }
      .mirror { opacity: 0.16; }
    }
  `],
})
export class HeroSceneComponent {
  /** Which tier of the product family the scene is staging. */
  @Input() tier: 'entry' | 'standard' | 'premium' | 'hero' = 'hero';
}

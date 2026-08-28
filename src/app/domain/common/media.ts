export type ImageRole = 'thumbnail' | 'card' | 'hero' | 'gallery' | 'logo';

export interface ImageAsset {
  readonly url: string;
  readonly alt: string;
  readonly role: ImageRole;
  readonly width?: number;
  readonly height?: number;
}

import {
  Size,
  PlatformProfile,
  PlatformId,
  meetsMinimumSize,
  Rect,
} from '../models/platform-profile';
import { planOutput } from './image-renderer';

export interface OutputCheck extends Size {
  readonly isValid: boolean;
}

export interface CheckableImage {
  readonly name: string;
  readonly naturalSize: Size | null;
  readonly crops: Partial<Record<PlatformId, Rect>>;
}

export interface ResolutionIssue extends Size {
  readonly imageName: string;
  readonly platformName: string;
}

/** Prueft die echte, nicht hochskalierte Exportgroesse einer Plattformfassung. */
export function checkOutput(
  crop: Rect | null,
  size: Size | null,
  platform: PlatformProfile,
): OutputCheck | null {
  const source = crop ?? (size ? { x: 0, y: 0, width: size.width, height: size.height } : null);
  if (!source) return null;

  const plan = planOutput(source, platform);
  const outputSize = { width: plan.width, height: plan.height };
  return { ...outputSize, isValid: meetsMinimumSize(outputSize, platform) };
}

/** Findet das erste Bild, das eine gewaehlte Plattform nicht annehmen wuerde. */
export function findResolutionIssue(
  images: readonly CheckableImage[],
  profile: readonly PlatformProfile[],
): ResolutionIssue | null {
  for (const image of images) {
    for (const platform of profile) {
      const check = checkOutput(image.crops[platform.id] ?? null, image.naturalSize, platform);
      if (check && !check.isValid) {
        return {
          imageName: image.name,
          platformName: platform.name,
          width: check.width,
          height: check.height,
        };
      }
    }
  }
  return null;
}

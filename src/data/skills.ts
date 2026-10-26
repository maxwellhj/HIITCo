export const MAX_SKILL_VIDEO_BYTES = 100 * 1024 * 1024;

export type SkillCategory = "Box" | "Lift" | "Sweat";

export interface SkillVideo {
  id: string;
  category: SkillCategory;
  title: string;
  description: string;
  videoUrl: string;
  posterUrl?: string;
  captionsUrl?: string;
}

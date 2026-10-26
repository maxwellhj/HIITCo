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

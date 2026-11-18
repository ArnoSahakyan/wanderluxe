export interface ITourCardProps {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
  duration: number;
  mode?: 'public' | 'admin';
  /** h2 when the card sits directly under the page's h1 (keeps heading levels in order). */
  headingLevel?: 'h2' | 'h3';
  /** Above the fold: load the image eagerly and early (Largest Contentful Paint). */
  priority?: boolean;
}

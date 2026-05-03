import type { HighlightMode } from './contracts';

export type Point2D = {
  x: number;
  y: number;
};

export type ViewerBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ViewerEntity = {
  id: string;
  kind: 'line' | 'polyline' | 'circle' | 'arc' | 'text' | 'unknown';
  layer: string;
  handle: string | null;
  label: string | null;
  points: Point2D[];
  bounds: ViewerBounds | null;
};

export type ViewerScene = {
  drawingPath: string | null;
  bounds: ViewerBounds | null;
  entities: ViewerEntity[];
};

export type ViewerHighlight = {
  featureIds: string[];
  entityHandles: string[];
  mode: HighlightMode;
};
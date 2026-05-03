import type { EntityHandle, HighlightMode } from './contracts';

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

type ViewerEntityBase = {
  id: string;
  layer: string;
  handle: EntityHandle | null;
  label: string | null;
  bounds: ViewerBounds | null;
};

export type ViewerLineEntity = ViewerEntityBase & {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type ViewerPolylineEntity = ViewerEntityBase & {
  kind: 'polyline';
  points: Point2D[];
  closed: boolean;
};

export type ViewerCircleEntity = ViewerEntityBase & {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
};

export type ViewerArcEntity = ViewerEntityBase & {
  kind: 'arc';
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
};

export type ViewerTextEntity = ViewerEntityBase & {
  kind: 'text';
  x: number;
  y: number;
  value: string;
};

export type ViewerUnknownEntity = ViewerEntityBase & {
  kind: 'unknown';
  points: Point2D[];
};

export type ViewerEntity =
  | ViewerLineEntity
  | ViewerPolylineEntity
  | ViewerCircleEntity
  | ViewerArcEntity
  | ViewerTextEntity
  | ViewerUnknownEntity;

export type ViewerHandleIndex = Record<EntityHandle, string>;

export type ViewerScene = {
  drawingPath: string | null;
  bounds: ViewerBounds | null;
  entities: ViewerEntity[];
  handleIndex: ViewerHandleIndex;
};

export type ViewerHighlight = {
  featureIds: string[];
  entityHandles: EntityHandle[];
  mode: HighlightMode;
};
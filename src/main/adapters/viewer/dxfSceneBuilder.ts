import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
  type ITextEntity
} from 'dxf-parser';
import type { EntityHandle } from '../../../shared/contracts';
import type { Point2D, ViewerBounds, ViewerEntity, ViewerScene } from '../../../shared/viewerTypes';

type ParsedDxfDocument = {
  entities: IEntity[];
};

export async function buildSceneFromDxf(dxfPath: string): Promise<ViewerScene> {
  const drawingPath = resolve(dxfPath);
  const parser = new DxfParser();
  const content = await readFile(drawingPath, 'utf8');
  const document = parser.parseSync(content) as ParsedDxfDocument;
  const entities = document.entities.flatMap((entity, index) => normalizeEntity(entity, index));
  const handleIndex = entities.reduce<ViewerScene['handleIndex']>((index, entity) => {
    if (entity.handle !== null) {
      index[entity.handle] = entity.id;
    }

    return index;
  }, {});

  return {
    drawingPath,
    bounds: computeSceneBounds(entities),
    entities,
    handleIndex
  };
}

export function buildHighlightSet(scene: ViewerScene, handles: string[]): string[] {
  return handles
    .map((handle) => scene.handleIndex[normalizeHandle(handle)])
    .filter((entityId): entityId is string => typeof entityId === 'string');
}

function normalizeEntity(entity: IEntity, index: number): ViewerEntity[] {
  switch (entity.type) {
    case 'LINE':
      return normalizeLineEntity(entity as ILineEntity, index);
    case 'LWPOLYLINE':
      return normalizeLwPolylineEntity(entity as ILwpolylineEntity, index);
    case 'POLYLINE':
      return normalizePolylineEntity(entity as IPolylineEntity, index);
    case 'CIRCLE':
      return normalizeCircleEntity(entity as ICircleEntity, index);
    case 'ARC':
      return normalizeArcEntity(entity as IArcEntity, index);
    case 'TEXT':
      return normalizeTextEntity(entity as ITextEntity, index);
    default:
      return [];
  }
}

function normalizeLineEntity(entity: ILineEntity, index: number): ViewerEntity[] {
  if (entity.vertices.length < 2) {
    return [];
  }

  const [start, end] = entity.vertices;
  const points = [toPoint2D(start), toPoint2D(end)];

  return [
    {
      id: createEntityId(entity, index),
      kind: 'line',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: computeBoundsFromPoints(points),
      x1: points[0].x,
      y1: points[0].y,
      x2: points[1].x,
      y2: points[1].y
    }
  ];
}

function normalizeLwPolylineEntity(entity: ILwpolylineEntity, index: number): ViewerEntity[] {
  const points = entity.vertices.map(toPoint2D);

  if (points.length === 0) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'polyline',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: computeBoundsFromPoints(points),
      points,
      closed: Boolean(entity.shape)
    }
  ];
}

function normalizePolylineEntity(entity: IPolylineEntity, index: number): ViewerEntity[] {
  const points = entity.vertices.map(toPoint2D);

  if (points.length === 0) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'polyline',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: computeBoundsFromPoints(points),
      points,
      closed: Boolean(entity.shape)
    }
  ];
}

function normalizeCircleEntity(entity: ICircleEntity, index: number): ViewerEntity[] {
  const cx = entity.center.x;
  const cy = entity.center.y;
  const radius = entity.radius;

  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius)) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'circle',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: {
        minX: cx - radius,
        minY: cy - radius,
        maxX: cx + radius,
        maxY: cy + radius
      },
      cx,
      cy,
      r: radius
    }
  ];
}

function normalizeArcEntity(entity: IArcEntity, index: number): ViewerEntity[] {
  const cx = entity.center.x;
  const cy = entity.center.y;
  const radius = entity.radius;

  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius)) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'arc',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: computeArcBounds(entity),
      cx,
      cy,
      r: radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle
    }
  ];
}

function normalizeTextEntity(entity: ITextEntity, index: number): ViewerEntity[] {
  const point = toPoint2D(entity.startPoint);
  const value = entity.text ?? '';
  const textHeight = Number.isFinite(entity.textHeight) ? entity.textHeight : 0;
  const estimatedWidth = value.length * textHeight * 0.6;

  return [
    {
      id: createEntityId(entity, index),
      kind: 'text',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: value.length > 0 ? value : null,
      bounds: {
        minX: point.x,
        minY: point.y - textHeight,
        maxX: point.x + estimatedWidth,
        maxY: point.y
      },
      x: point.x,
      y: point.y,
      value
    }
  ];
}

function computeSceneBounds(entities: ViewerEntity[]): ViewerBounds | null {
  const boundsList = entities.flatMap((entity) => (entity.bounds === null ? [] : [entity.bounds]));

  if (boundsList.length === 0) {
    return null;
  }

  return boundsList.reduce<ViewerBounds>((accumulator, bounds) => ({
    minX: Math.min(accumulator.minX, bounds.minX),
    minY: Math.min(accumulator.minY, bounds.minY),
    maxX: Math.max(accumulator.maxX, bounds.maxX),
    maxY: Math.max(accumulator.maxY, bounds.maxY)
  }));
}

function computeBoundsFromPoints(points: Point2D[]): ViewerBounds | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function computeArcBounds(entity: IArcEntity): ViewerBounds {
  const candidateAngles = [entity.startAngle, entity.endAngle, 0, 90, 180, 270]
    .map(normalizeAngle)
    .filter((angle, index, values) => values.indexOf(angle) === index)
    .filter((angle) => angle === normalizeAngle(entity.startAngle) || angle === normalizeAngle(entity.endAngle) || isAngleWithinArc(angle, entity.startAngle, entity.endAngle));
  const points = candidateAngles.map((angle) => ({
    x: entity.center.x + entity.radius * Math.cos(toRadians(angle)),
    y: entity.center.y + entity.radius * Math.sin(toRadians(angle))
  }));

  return computeBoundsFromPoints(points) ?? {
    minX: entity.center.x,
    minY: entity.center.y,
    maxX: entity.center.x,
    maxY: entity.center.y
  };
}

function isAngleWithinArc(angle: number, startAngle: number, endAngle: number): boolean {
  const normalizedAngle = normalizeAngle(angle);
  const normalizedStart = normalizeAngle(startAngle);
  const normalizedEnd = normalizeAngle(endAngle);

  if (normalizedStart <= normalizedEnd) {
    return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd;
  }

  return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd;
}

function normalizeAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function toRadians(angle: number): number {
  return (angle * Math.PI) / 180;
}

function toPoint2D(point: IPoint | { x: number; y: number }): Point2D {
  return {
    x: point.x,
    y: point.y
  };
}

function createEntityId(entity: IEntity, index: number): string {
  const handle = readHandle(entity);
  return handle === null ? `entity-${index}` : `entity-${handle}`;
}

function readHandle(entity: { handle?: unknown }): EntityHandle | null {
  if (typeof entity.handle !== 'string') {
    return null;
  }

  const normalized = normalizeHandle(entity.handle);
  return normalized.length > 0 ? normalized : null;
}

function normalizeHandle(handle: string): EntityHandle {
  return handle.trim().toUpperCase();
}

function readLayer(entity: { layer?: unknown }): string {
  return typeof entity.layer === 'string' && entity.layer.length > 0 ? entity.layer : '0';
}
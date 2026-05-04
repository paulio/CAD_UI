import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IEntity,
  type IInsertEntity,
  type ILayer,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPoint,
  type IPolylineEntity,
  type ITextEntity
} from 'dxf-parser';
import type { EntityHandle } from '../../../shared/contracts';
import type { Point2D, ViewerBounds, ViewerEntity, ViewerLayer, ViewerPolylineVertex, ViewerScene } from '../../../shared/viewerTypes';

type ParsedDxfDocument = {
  entities: IEntity[];
  tables?: {
    layer?: {
      layers?: Record<string, ILayer>;
    };
  };
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
  const layers = buildLayerIndex(entities, document.tables?.layer?.layers ?? {});

  return {
    drawingPath,
    bounds: computeSceneBounds(entities),
    focusBounds: computeFocusedSceneBounds(entities),
    entities,
    layers,
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
    case 'INSERT':
      return normalizeInsertEntity(entity as IInsertEntity, index);
    case 'CIRCLE':
      return normalizeCircleEntity(entity as ICircleEntity, index);
    case 'ARC':
      return normalizeArcEntity(entity as IArcEntity, index);
    case 'TEXT':
      return normalizeTextEntity(entity as ITextEntity, index);
    case 'POINT':
      return normalizePointEntity(entity as IEntity & { position?: IPoint }, index);
    default:
      return normalizeUnknownEntity(entity, index);
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
  const vertices = entity.vertices.map(toPolylineVertex);
  const points = vertices.map(toPoint2D);
  const closed = readClosedPolylineFlag(entity);

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
      bounds: computePolylineBounds(vertices, closed),
      points,
      vertices,
      closed
    }
  ];
}

function normalizePolylineEntity(entity: IPolylineEntity, index: number): ViewerEntity[] {
  const vertices = entity.vertices.map(toPolylineVertex);
  const points = vertices.map(toPoint2D);
  const closed = readClosedPolylineFlag(entity);

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
      bounds: computePolylineBounds(vertices, closed),
      points,
      vertices,
      closed
    }
  ];
}

function normalizeInsertEntity(entity: IInsertEntity, index: number): ViewerEntity[] {
  const point = toPoint2D(entity.position);

  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'insert',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: typeof entity.name === 'string' && entity.name.length > 0 ? entity.name : null,
      bounds: {
        minX: point.x,
        minY: point.y,
        maxX: point.x,
        maxY: point.y
      },
      x: point.x,
      y: point.y,
      name: typeof entity.name === 'string' && entity.name.length > 0 ? entity.name : null
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

function normalizeUnknownEntity(entity: IEntity, index: number): ViewerEntity[] {
  const handle = readHandle(entity);
  const points = extractFallbackPoints(entity);

  if (points.length === 0 && handle === null) {
    return [];
  }

  return [
    {
      id: createEntityId(entity, index),
      kind: 'unknown',
      handle,
      layer: readLayer(entity),
      label: typeof entity.type === 'string' && entity.type.length > 0 ? entity.type : 'Unsupported entity',
      bounds: computeBoundsFromPoints(points),
      points
    }
  ];
}

function normalizeTextEntity(entity: ITextEntity, index: number): ViewerEntity[] {
  const point = toPoint2D(entity.startPoint);
  const value = entity.text ?? '';
  const textHeight = Number.isFinite(entity.textHeight) && entity.textHeight > 0 ? entity.textHeight : 0.18;
  const rotation = Number.isFinite(entity.rotation) ? entity.rotation : 0;
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
      value,
      fontSize: textHeight,
      rotation
    }
  ];
}

function normalizePointEntity(entity: IEntity & { position?: IPoint }, index: number): ViewerEntity[] {
  const position = entity.position;

  if (position === undefined || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return [];
  }

  const point = toPoint2D(position);

  return [
    {
      id: createEntityId(entity, index),
      kind: 'point',
      handle: readHandle(entity),
      layer: readLayer(entity),
      label: null,
      bounds: {
        minX: point.x,
        minY: point.y,
        maxX: point.x,
        maxY: point.y
      },
      x: point.x,
      y: point.y
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

function computeFocusedSceneBounds(entities: ViewerEntity[]): ViewerBounds | null {
  const presentationLayers = new Set(['format', 'viewport', 'legend', 'north']);
  const preferredEntities = entities.filter(
    (entity) => !presentationLayers.has(entity.layer.toLowerCase()) && entity.kind !== 'point'
  );
  const preferredBounds = computeSceneBounds(preferredEntities);

  return preferredBounds ?? computeSceneBounds(entities);
}

function buildLayerIndex(entities: ViewerEntity[], dxfLayers: Record<string, ILayer>): ViewerLayer[] {
  const counts = new Map<string, number>();

  for (const entity of entities) {
    counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
  }

  const layerIds = new Set<string>(counts.keys());

  for (const layerId of Object.keys(dxfLayers)) {
    layerIds.add(layerId);
  }

  return [...layerIds].sort().map((id) => {
    const dxfLayer = dxfLayers[id];

    return {
      id,
      name: dxfLayer?.name ?? id,
      color: formatLayerColor(dxfLayer?.color),
      visible: dxfLayer ? dxfLayer.visible !== false && dxfLayer.frozen !== true : true,
      locked: false,
      entityCount: counts.get(id) ?? 0
    };
  });
}

function formatLayerColor(color: number | undefined): string | null {
  if (typeof color !== 'number' || !Number.isFinite(color) || color < 0) {
    return null;
  }

  const clamped = Math.floor(color) & 0xffffff;

  // ACI 7 in DWG is "auto" (black on white BG / white on black BG). dxf-parser
  // typically reports it as either #ffffff or #000000. Both are unreadable on
  // our near-white canvas, so fall back to the default entity stroke colour.
  if (clamped === 0xffffff || clamped === 0x000000) {
    return null;
  }

  return `#${clamped.toString(16).padStart(6, '0')}`;
}

function computeBoundsFromPoints(points: Point2D[]): ViewerBounds | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: sanitizeCoordinate(Math.min(...xs)),
    minY: sanitizeCoordinate(Math.min(...ys)),
    maxX: sanitizeCoordinate(Math.max(...xs)),
    maxY: sanitizeCoordinate(Math.max(...ys))
  };
}

function computePolylineBounds(vertices: ViewerPolylineVertex[], closed: boolean): ViewerBounds | null {
  const points = vertices.map(toPoint2D);
  const initialBounds = computeBoundsFromPoints(points);

  if (initialBounds === null || vertices.length < 2) {
    return initialBounds;
  }

  const segmentCount = closed ? vertices.length : vertices.length - 1;

  return Array.from({ length: segmentCount }).reduce<ViewerBounds>((bounds, _value, index) => {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const bulgeBounds = computeBulgeBounds(start, end, start.bulge);

    return bulgeBounds === null ? bounds : mergeBounds(bounds, bulgeBounds);
  }, initialBounds);
}

function computeArcBounds(entity: IArcEntity): ViewerBounds {
  const startAngle = normalizeRadians(entity.startAngle);
  const endAngle = normalizeRadians(entity.endAngle);
  const sweepAngle = computeCounterClockwiseSweep(startAngle, endAngle);
  const candidateAngles = [startAngle, endAngle, 0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
    .filter((angle, index, values) => values.findIndex((candidate) => areAnglesEqual(candidate, angle)) === index)
    .filter((angle) => areAnglesEqual(angle, startAngle) || areAnglesEqual(angle, endAngle) || isAngleWithinSweep(angle, startAngle, sweepAngle));
  const points = candidateAngles.map((angle) => ({
    x: entity.center.x + entity.radius * Math.cos(angle),
    y: entity.center.y + entity.radius * Math.sin(angle)
  }));

  return computeBoundsFromPoints(points) ?? {
    minX: entity.center.x,
    minY: entity.center.y,
    maxX: entity.center.x,
    maxY: entity.center.y
  };
}

function computeBulgeBounds(start: ViewerPolylineVertex, end: ViewerPolylineVertex, bulge: number): ViewerBounds | null {
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9) {
    return null;
  }

  const chordX = end.x - start.x;
  const chordY = end.y - start.y;
  const chordLength = Math.hypot(chordX, chordY);

  if (chordLength < 1e-9) {
    return computeBoundsFromPoints([start, end]);
  }

  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const leftNormalX = -chordY / chordLength;
  const leftNormalY = chordX / chordLength;
  const offset = (chordLength * (1 - bulge * bulge)) / (4 * bulge);
  const centerX = midpointX + leftNormalX * offset;
  const centerY = midpointY + leftNormalY * offset;
  const radius = Math.hypot(start.x - centerX, start.y - centerY);

  if (!Number.isFinite(radius) || radius < 1e-9) {
    return computeBoundsFromPoints([start, end]);
  }

  const startAngle = normalizeRadians(Math.atan2(start.y - centerY, start.x - centerX));
  const sweepAngle = 4 * Math.atan(bulge);
  const candidateAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].filter((angle) =>
    isAngleWithinSweep(angle, startAngle, sweepAngle)
  );
  const points = [start, end, ...candidateAngles.map((angle) => ({
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  }))];

  return computeBoundsFromPoints(points);
}

function computeCounterClockwiseSweep(startAngle: number, endAngle: number): number {
  return normalizeRadians(endAngle - startAngle);
}

function normalizeRadians(angle: number): number {
  const normalized = angle % (2 * Math.PI);
  return normalized < 0 ? normalized + 2 * Math.PI : normalized;
}

function areAnglesEqual(left: number, right: number): boolean {
  return Math.abs(normalizeRadians(left - right)) < 1e-9;
}

function isAngleWithinSweep(angle: number, startAngle: number, sweepAngle: number): boolean {
  if (sweepAngle >= 0) {
    return normalizeRadians(angle - startAngle) <= sweepAngle + 1e-9;
  }

  return normalizeRadians(startAngle - angle) <= Math.abs(sweepAngle) + 1e-9;
}

function toPoint2D(point: IPoint | { x: number; y: number }): Point2D {
  return {
    x: point.x,
    y: point.y
  };
}

function toPolylineVertex(point: IPoint | { x: number; y: number; bulge?: number }): ViewerPolylineVertex {
  return {
    x: point.x,
    y: point.y,
    bulge: typeof point.bulge === 'number' && Number.isFinite(point.bulge) ? point.bulge : 0
  };
}

function mergeBounds(left: ViewerBounds, right: ViewerBounds): ViewerBounds {
  return {
    minX: sanitizeCoordinate(Math.min(left.minX, right.minX)),
    minY: sanitizeCoordinate(Math.min(left.minY, right.minY)),
    maxX: sanitizeCoordinate(Math.max(left.maxX, right.maxX)),
    maxY: sanitizeCoordinate(Math.max(left.maxY, right.maxY))
  };
}

function sanitizeCoordinate(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : value;
}

function extractFallbackPoints(entity: IEntity): Point2D[] {
  const pointCollections = ['vertices', 'controlPoints', 'fitPoints']
    .flatMap((key) => readPointArray((entity as Record<string, unknown>)[key]));
  const singlePoints = ['position', 'center', 'startPoint', 'endPoint', 'anchorPoint', 'middleOfText', 'insertionPoint']
    .flatMap((key) => {
      const point = readPoint((entity as Record<string, unknown>)[key]);
      return point === null ? [] : [point];
    });

  return dedupePoints([...pointCollections, ...singlePoints]);
}

function readPointArray(value: unknown): Point2D[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const point = readPoint(entry);
    return point === null ? [] : [point];
  });
}

function readPoint(value: unknown): Point2D | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown };

  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    return null;
  }

  return {
    x: sanitizeCoordinate(candidate.x),
    y: sanitizeCoordinate(candidate.y)
  };
}

function dedupePoints(points: Point2D[]): Point2D[] {
  const seen = new Set<string>();

  return points.filter((point) => {
    const key = `${point.x}:${point.y}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function readClosedPolylineFlag(entity: { closed?: unknown; shape?: unknown }): boolean {
  return entity.closed === true || entity.shape === true;
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
import type { HighlightMode } from '../../../shared/contracts';
import type { Point2D, ViewerEntity, ViewerScene } from '../../../shared/viewerTypes';

type DrawingCanvasProps = {
  scene: ViewerScene | null;
  highlightedEntityIds: string[];
  highlightMode: HighlightMode;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
};

export function DrawingCanvas(props: DrawingCanvasProps) {
  if (props.scene === null || props.scene.bounds === null) {
    return (
      <section className="panel drawing-canvas" aria-label="Drawing canvas">
        <div className="panel__header">
          <h2>Viewer</h2>
          <p>Load a DWG or DXF to inspect geometry and apply chat-linked focus.</p>
        </div>
        <p className="empty-state">No drawing loaded</p>
      </section>
    );
  }

  const { bounds } = props.scene;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const highlightedLabel = props.highlightedEntityIds[0] ?? 'none';

  return (
    <section className="panel drawing-canvas" aria-label="Drawing canvas" data-highlight-mode={props.highlightMode}>
      <div className="panel__header">
        <h2>Viewer</h2>
        <p>{`Highlighted: ${highlightedLabel}`}</p>
        <p>{`Highlight mode: ${props.highlightMode}`}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Drawing canvas surface">
        <rect x="0" y="0" width={width} height={height} className="drawing-canvas__frame" />
        {props.scene.entities.map((entity) => {
          const isHighlighted = props.highlightedEntityIds.includes(entity.id);
          const isSelected = props.selectedEntityId === entity.id;

          return renderEntity(entity, bounds.minX, bounds.maxY, isHighlighted, isSelected, props.onSelectEntity);
        })}
      </svg>
    </section>
  );
}

function renderEntity(
  entity: ViewerEntity,
  minX: number,
  maxY: number,
  isHighlighted: boolean,
  isSelected: boolean,
  onSelectEntity: (entityId: string) => void
) {
  const className = ['drawing-entity', isHighlighted ? 'drawing-entity--highlighted' : '', isSelected ? 'drawing-entity--selected' : '']
    .filter((token) => token.length > 0)
    .join(' ');
  const commonProps = {
    className,
    onClick: () => onSelectEntity(entity.id),
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': entity.label ?? entity.id
  };

  switch (entity.kind) {
    case 'line':
      return <line key={entity.id} {...commonProps} x1={toSvgX(entity.x1, minX)} y1={toSvgY(entity.y1, maxY)} x2={toSvgX(entity.x2, minX)} y2={toSvgY(entity.y2, maxY)} />;
    case 'polyline':
      return <polyline key={entity.id} {...commonProps} points={toSvgPointString(entity.points, minX, maxY, entity.closed)} fill="none" />;
    case 'insert':
      return <circle key={entity.id} {...commonProps} cx={toSvgX(entity.x, minX)} cy={toSvgY(entity.y, maxY)} r={4} />;
    case 'circle':
      return <circle key={entity.id} {...commonProps} cx={toSvgX(entity.cx, minX)} cy={toSvgY(entity.cy, maxY)} r={entity.r} fill="none" />;
    case 'arc': {
      const startX = entity.cx + entity.r * Math.cos(entity.startAngle);
      const startY = entity.cy + entity.r * Math.sin(entity.startAngle);
      const endX = entity.cx + entity.r * Math.cos(entity.endAngle);
      const endY = entity.cy + entity.r * Math.sin(entity.endAngle);
      const sweepAngle = normalizeRadians(entity.endAngle - entity.startAngle);
      const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;

      return (
        <path
          key={entity.id}
          {...commonProps}
          d={`M ${toSvgX(startX, minX)} ${toSvgY(startY, maxY)} A ${entity.r} ${entity.r} 0 ${largeArcFlag} 0 ${toSvgX(endX, minX)} ${toSvgY(endY, maxY)}`}
          fill="none"
        />
      );
    }
    case 'text':
      return (
        <text key={entity.id} {...commonProps} x={toSvgX(entity.x, minX)} y={toSvgY(entity.y, maxY)}>
          {entity.value}
        </text>
      );
    case 'unknown':
      if (entity.points.length === 1) {
        return <circle key={entity.id} {...commonProps} cx={toSvgX(entity.points[0].x, minX)} cy={toSvgY(entity.points[0].y, maxY)} r={2} />;
      }

      return <polyline key={entity.id} {...commonProps} points={toSvgPointString(entity.points, minX, maxY, false)} fill="none" />;
    default:
      return null;
  }
}

function toSvgX(value: number, minX: number): number {
  return value - minX;
}

function toSvgY(value: number, maxY: number): number {
  return maxY - value;
}

function toSvgPointString(points: Point2D[], minX: number, maxY: number, closed: boolean): string {
  const renderPoints = closed && points.length > 0 ? [...points, points[0]] : points;

  return renderPoints.map((point) => `${toSvgX(point.x, minX)},${toSvgY(point.y, maxY)}`).join(' ');
}

function normalizeRadians(angle: number): number {
  const normalized = angle % (2 * Math.PI);
  return normalized < 0 ? normalized + 2 * Math.PI : normalized;
}
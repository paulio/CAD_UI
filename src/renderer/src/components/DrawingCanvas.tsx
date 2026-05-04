import type { HighlightMode } from '../../../shared/contracts';
import type { Point2D, ViewerEntity, ViewerPolylineEntity, ViewerPolylineVertex, ViewerScene } from '../../../shared/viewerTypes';

type DrawingCanvasProps = {
  scene: ViewerScene | null;
  highlightedEntityIds: string[];
  highlightMode: HighlightMode;
  selectedEntityId: string | null;
  showSurveyPoints: boolean;
  onSelectEntity: (entityId: string) => void;
  onToggleSurveyPoints: (next: boolean) => void;
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

  const bounds = props.scene.focusBounds ?? props.scene.bounds;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const markerSize = Math.max(width, height) * 0.005;
  const highlightedLabel = props.highlightedEntityIds[0] ?? 'none';

  return (
    <section className="panel drawing-canvas" aria-label="Drawing canvas" data-highlight-mode={props.highlightMode}>
      <div className="panel__header">
        <h2>Viewer</h2>
        <p>{`Highlighted: ${highlightedLabel}`}</p>
        <p>{`Highlight mode: ${props.highlightMode}`}</p>
        <label className="viewer-toggle">
          <input
            type="checkbox"
            checked={props.showSurveyPoints}
            onChange={(event) => props.onToggleSurveyPoints(event.target.checked)}
          />
          Show survey points
        </label>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Drawing canvas surface">
        <rect x="0" y="0" width={width} height={height} className="drawing-canvas__frame" />
        {props.scene.entities.map((entity) => {
          if (entity.kind === 'point' && !props.showSurveyPoints) {
            return null;
          }

          const isHighlighted = props.highlightedEntityIds.includes(entity.id);
          const isSelected = props.selectedEntityId === entity.id;

          return renderEntity(entity, bounds.minX, bounds.maxY, markerSize, isHighlighted, isSelected, props.onSelectEntity);
        })}
      </svg>
    </section>
  );
}

function renderEntity(
  entity: ViewerEntity,
  minX: number,
  maxY: number,
  markerSize: number,
  isHighlighted: boolean,
  isSelected: boolean,
  onSelectEntity: (entityId: string) => void
) {
  const className = [
    'drawing-entity',
    entity.kind === 'text' ? 'drawing-entity--text' : '',
    entity.kind === 'insert' ? 'drawing-entity--insert' : '',
    entity.kind === 'point' ? 'drawing-entity--point' : '',
    isHighlighted ? 'drawing-entity--highlighted' : '',
    isSelected ? 'drawing-entity--selected' : ''
  ]
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
    case 'polyline': {
      const pathData = toSvgPolylinePathData(entity, minX, maxY);

      if (pathData !== null) {
        return <path key={entity.id} {...commonProps} d={pathData} fill="none" />;
      }

      return <polyline key={entity.id} {...commonProps} points={toSvgPointString(entity.points, minX, maxY, entity.closed)} fill="none" />;
    }
    case 'insert': {
      const insertX = toSvgX(entity.x, minX);
      const insertY = toSvgY(entity.y, maxY);
      const half = markerSize;

      return (
        <path
          key={entity.id}
          {...commonProps}
          d={`M ${insertX - half} ${insertY} L ${insertX + half} ${insertY} M ${insertX} ${insertY - half} L ${insertX} ${insertY + half}`}
          fill="none"
        />
      );
    }
    case 'point': {
      return (
        <circle
          key={entity.id}
          {...commonProps}
          cx={toSvgX(entity.x, minX)}
          cy={toSvgY(entity.y, maxY)}
          r={markerSize * 0.4}
        />
      );
    }
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
      const textX = toSvgX(entity.x, minX);
      const textY = toSvgY(entity.y, maxY);
      const transform = entity.rotation === 0 ? undefined : `rotate(${-entity.rotation} ${textX} ${textY})`;

      return (
        <text
          key={entity.id}
          {...commonProps}
          x={textX}
          y={textY}
          fontSize={entity.fontSize}
          transform={transform}
        >
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

function toSvgPolylinePathData(entity: ViewerPolylineEntity, minX: number, maxY: number): string | null {
  if (!entity.vertices.some((vertex) => Math.abs(vertex.bulge) >= 1e-9) || entity.vertices.length === 0) {
    return null;
  }

  const commands = [`M ${toSvgX(entity.vertices[0].x, minX)} ${toSvgY(entity.vertices[0].y, maxY)}`];
  const segmentCount = entity.closed ? entity.vertices.length : entity.vertices.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = entity.vertices[index];
    const end = entity.vertices[(index + 1) % entity.vertices.length];

    commands.push(toSvgPolylineSegmentCommand(start, end, minX, maxY));
  }

  return commands.join(' ');
}

function toSvgPolylineSegmentCommand(start: ViewerPolylineVertex, end: ViewerPolylineVertex, minX: number, maxY: number): string {
  const endX = toSvgX(end.x, minX);
  const endY = toSvgY(end.y, maxY);

  if (!Number.isFinite(start.bulge) || Math.abs(start.bulge) < 1e-9) {
    return `L ${endX} ${endY}`;
  }

  const chordX = end.x - start.x;
  const chordY = end.y - start.y;
  const chordLength = Math.hypot(chordX, chordY);

  if (chordLength < 1e-9) {
    return `L ${endX} ${endY}`;
  }

  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const leftNormalX = -chordY / chordLength;
  const leftNormalY = chordX / chordLength;
  const offset = (chordLength * (1 - start.bulge * start.bulge)) / (4 * start.bulge);
  const centerX = midpointX + leftNormalX * offset;
  const centerY = midpointY + leftNormalY * offset;
  const radius = Math.hypot(start.x - centerX, start.y - centerY);
  const largeArcFlag = Math.abs(4 * Math.atan(start.bulge)) > Math.PI ? 1 : 0;
  const sweepFlag = start.bulge > 0 ? 0 : 1;

  return `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}

function normalizeRadians(angle: number): number {
  const normalized = angle % (2 * Math.PI);
  return normalized < 0 ? normalized + 2 * Math.PI : normalized;
}
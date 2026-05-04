import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HighlightMode } from '../../../shared/contracts';
import type { Point2D, ViewerEntity, ViewerPolylineEntity, ViewerPolylineVertex, ViewerScene } from '../../../shared/viewerTypes';
import {
  applyPan,
  applyWheelZoom,
  boundsForEntityIds,
  fitBounds,
  initialCamera,
  type CameraState,
  type ViewportSize
} from '../viewer/cameraState';

type DrawingCanvasProps = {
  scene: ViewerScene | null;
  highlightedEntityIds: string[];
  highlightMode: HighlightMode;
  selectedEntityId: string | null;
  showSurveyPoints: boolean;
  layerState?: Record<string, { visible: boolean; locked: boolean }>;
  onSelectEntity: (entityId: string) => void;
  onToggleSurveyPoints: (next: boolean) => void;
};

const FALLBACK_VIEWPORT: ViewportSize = { width: 1, height: 1 };

export function DrawingCanvas(props: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>(FALLBACK_VIEWPORT);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);

  const sceneBounds = props.scene?.focusBounds ?? props.scene?.bounds ?? null;

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node === null) {
      return;
    }

    const updateViewport = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) });
    };

    updateViewport();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sceneBounds === null) {
      setCamera(null);
      return;
    }

    setCamera(initialCamera(sceneBounds, viewport));
    // We intentionally only refit when the underlying scene bounds change, not viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scene?.drawingPath, sceneBounds?.minX, sceneBounds?.minY, sceneBounds?.maxX, sceneBounds?.maxY]);

  const fitAll = useCallback(() => {
    if (sceneBounds === null) return;
    setCamera(fitBounds(sceneBounds, viewport, { marginRatio: 0.05 }));
  }, [sceneBounds, viewport]);

  const fitSelection = useCallback(() => {
    if (props.scene === null) return;
    const targetIds = props.selectedEntityId !== null ? [props.selectedEntityId] : props.highlightedEntityIds;
    const selectionBounds = boundsForEntityIds(props.scene, targetIds);
    if (selectionBounds === null) return;
    setCamera(fitBounds(selectionBounds, viewport, { marginRatio: 0.25 }));
  }, [props.scene, props.selectedEntityId, props.highlightedEntityIds, viewport]);

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      if (camera === null || svgRef.current === null) return;
      event.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      setCamera((current) => (current === null ? current : applyWheelZoom(current, { screenX, screenY, deltaY: event.deltaY }, viewport)));
    },
    [camera, viewport]
  );

  const onMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== 0 && event.button !== 1) return;
      // Pan when middle-button or when target is the SVG/frame (not an entity).
      const target = event.target as SVGElement;
      const isCanvasBackground =
        event.button === 1 ||
        target === svgRef.current ||
        target.classList.contains('drawing-canvas__frame');
      if (!isCanvasBackground) return;

      event.preventDefault();
      setIsPanning(true);
      lastPanPointRef.current = { x: event.clientX, y: event.clientY };
    },
    []
  );

  const onMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning || lastPanPointRef.current === null) return;
      const dxScreen = event.clientX - lastPanPointRef.current.x;
      const dyScreen = event.clientY - lastPanPointRef.current.y;
      lastPanPointRef.current = { x: event.clientX, y: event.clientY };
      setCamera((current) => (current === null ? current : applyPan(current, { dxScreen, dyScreen }, viewport)));
    },
    [isPanning, viewport]
  );

  const endPan = useCallback(() => {
    setIsPanning(false);
    lastPanPointRef.current = null;
  }, []);

  if (props.scene === null || sceneBounds === null) {
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

  const bounds = sceneBounds;
  const sceneWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const sceneHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const markerSize = Math.max(sceneWidth, sceneHeight) * 0.005;
  const highlightedLabel = props.highlightedEntityIds[0] ?? 'none';
  const activeCamera = camera ?? initialCamera(bounds, viewport);
  const viewBox = computeLocalViewBox(activeCamera, viewport, bounds);
  const fitSelectionDisabled =
    props.selectedEntityId === null && props.highlightedEntityIds.length === 0;

  return (
    <section
      className="panel drawing-canvas"
      aria-label="Drawing canvas"
      data-highlight-mode={props.highlightMode}
    >
      <div className="panel__header">
        <h2>Viewer</h2>
        <p>{`Highlighted: ${highlightedLabel}`}</p>
        <p>{`Highlight mode: ${props.highlightMode}`}</p>
        <div className="drawing-canvas__toolbar" role="toolbar" aria-label="Viewer controls">
          <button type="button" onClick={fitAll}>Fit all</button>
          <button type="button" onClick={fitSelection} disabled={fitSelectionDisabled}>
            Fit selection
          </button>
          <span className="drawing-canvas__zoom" aria-live="polite">{`Zoom: ${activeCamera.zoom.toFixed(2)}\u00d7`}</span>
        </div>
        <label className="viewer-toggle">
          <input
            type="checkbox"
            checked={props.showSurveyPoints}
            onChange={(event) => props.onToggleSurveyPoints(event.target.checked)}
          />
          Show survey points
        </label>
      </div>
      <div className="drawing-canvas__surface" ref={containerRef}>
        <svg
          ref={svgRef}
          viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
          role="img"
          aria-label="Drawing canvas surface"
          data-zoom={activeCamera.zoom}
          className={isPanning ? 'drawing-canvas__svg drawing-canvas__svg--panning' : 'drawing-canvas__svg'}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endPan}
          onMouseLeave={endPan}
        >
          <rect
            x={0}
            y={0}
            width={sceneWidth}
            height={sceneHeight}
            className="drawing-canvas__frame"
          />
          {props.scene.entities.map((entity) => {
            if (entity.kind === 'point' && !props.showSurveyPoints) {
              return null;
            }

            const layer = props.layerState?.[entity.layer];
            if (layer && !layer.visible) {
              return null;
            }

            const isLocked = layer?.locked ?? false;
            const isHighlighted = props.highlightedEntityIds.includes(entity.id);
            const isSelected = props.selectedEntityId === entity.id;
            const onSelect = isLocked ? noopSelect : props.onSelectEntity;

            return renderEntity(entity, bounds.minX, bounds.maxY, markerSize, isHighlighted, isSelected, onSelect, isLocked);
          })}
        </svg>
      </div>
    </section>
  );
}

function computeLocalViewBox(
  camera: CameraState,
  viewport: ViewportSize,
  bounds: { minX: number; maxY: number }
): { minX: number; minY: number; width: number; height: number } {
  const zoom = camera.zoom > 0 ? camera.zoom : 1;
  const width = Math.max(viewport.width, 1) / zoom;
  const height = Math.max(viewport.height, 1) / zoom;
  const localCenterX = camera.center.x - bounds.minX;
  const localCenterY = bounds.maxY - camera.center.y;

  return {
    minX: localCenterX - width / 2,
    minY: localCenterY - height / 2,
    width,
    height
  };
}

const noopSelect = (_id: string): void => undefined;

function renderEntity(
  entity: ViewerEntity,
  minX: number,
  maxY: number,
  markerSize: number,
  isHighlighted: boolean,
  isSelected: boolean,
  onSelectEntity: (entityId: string) => void,
  isLocked: boolean
) {
  const className = [
    'drawing-entity',
    entity.kind === 'text' ? 'drawing-entity--text' : '',
    entity.kind === 'insert' ? 'drawing-entity--insert' : '',
    entity.kind === 'point' ? 'drawing-entity--point' : '',
    isLocked ? 'drawing-entity--locked' : '',
    isHighlighted ? 'drawing-entity--highlighted' : '',
    isSelected ? 'drawing-entity--selected' : ''
  ]
    .filter((token) => token.length > 0)
    .join(' ');
  const commonProps = {
    className,
    onClick: isLocked ? undefined : () => onSelectEntity(entity.id),
    tabIndex: isLocked ? -1 : 0,
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
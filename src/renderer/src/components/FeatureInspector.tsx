import type { ViewerEntity } from '../../../shared/viewerTypes';

type FeatureInspectorProps = {
  entity: ViewerEntity | null;
};

export function FeatureInspector(props: FeatureInspectorProps) {
  return (
    <section className="panel feature-inspector">
      <div className="panel__header">
        <h2>Selected entity</h2>
        <p>Inspect the geometry the chat flow or viewer currently has in focus.</p>
      </div>
      {props.entity === null ? (
        <p className="empty-state">No entity selected.</p>
      ) : (
        <dl className="feature-inspector__details">
          <div>
            <dt>Entity id</dt>
            <dd>{props.entity.id}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{props.entity.kind}</dd>
          </div>
          <div>
            <dt>Layer</dt>
            <dd>{props.entity.layer}</dd>
          </div>
          <div>
            <dt>Handle</dt>
            <dd>{props.entity.handle ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Label</dt>
            <dd>{props.entity.label ?? 'Unavailable'}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
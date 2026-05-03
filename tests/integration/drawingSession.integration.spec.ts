import { describe, expect, it } from 'vitest';
import { DrawingSessionService } from '../../src/main/adapters/cadAi/drawingSessionService';

describe('DrawingSessionService', () => {
  it('opens a DXF drawing and returns cache-backed session metadata', async () => {
    const service = new DrawingSessionService({
      cadAiRoot: 'D:/CAD/CAD_AI',
      diagnostics: { add: () => undefined }
    });

    const session = await service.openDrawing('tests/fixtures/site.dxf');

    expect(session.sourcePath).toMatch(/site\.dxf$/);
    expect(session.cachePath).toMatch(/site\.dxf\.cadqcache$/);
    expect(session.dxfPath).toMatch(/site\.dxf$/);
  });
});
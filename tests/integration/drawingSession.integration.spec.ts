import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CadAiAdapter } from '../../src/main/adapters/cadAi/cadAiAdapter';
import { resolveCadAiCommand } from '../../src/main/adapters/cadAi/cadAiLocator';
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

  it('infers an adjacent DXF path for DWG ingest output when CAD_AI omits it', async () => {
    const fixtureRoot = 'tests/.tmp/dwg-adjacent-dxf';
    const sourcePath = join(fixtureRoot, 'sample.dwg');
    const adjacentDxfPath = join(fixtureRoot, 'sample.dxf');
    const cachePath = join(fixtureRoot, 'sample.dwg.cadqcache');

    await rm(fixtureRoot, { force: true, recursive: true });
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(sourcePath, '', 'utf8');
    await writeFile(adjacentDxfPath, '', 'utf8');

    const adapter = new CadAiAdapter({
      cadAiRoot: 'D:/CAD/CAD_AI',
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ cache: cachePath }),
        stderr: ''
      })
    });

    await expect(adapter.ingest(sourcePath)).resolves.toMatchObject({
      sourcePath: expect.stringMatching(/sample\.dwg$/),
      cachePath: expect.stringMatching(/sample\.dwg\.cadqcache$/),
      dxfPath: expect.stringMatching(/sample\.dxf$/)
    });

    await rm(fixtureRoot, { force: true, recursive: true });
  });

  it('builds a Python fallback command that imports cadq from the sibling repo source tree', async () => {
    const cadAiRoot = 'tests/.tmp/cad-ai-root';
    const pythonExe = join(cadAiRoot, '.venv', 'Scripts', 'python.exe');

    await rm(cadAiRoot, { force: true, recursive: true });
    await mkdir(dirname(pythonExe), { recursive: true });
    await mkdir(join(cadAiRoot, 'src'), { recursive: true });
    await writeFile(pythonExe, '', 'utf8');

    const command = resolveCadAiCommand(cadAiRoot);

    expect(command.command).toMatch(/python\.exe$/);
    expect(command.args[0]).toBe('-c');
    expect(command.args[1]).toContain('root / "src"');
    expect(command.args[1]).toContain('sys.path.insert(0, candidate_str)');
    expect(command.args[1]).toContain('from cadq.cli import app');

    await rm(cadAiRoot, { force: true, recursive: true });
  });
});
import type { DiagnosticEntry } from '../../shared/contracts';

const MAX_DIAGNOSTIC_ENTRIES = 50;

export class DiagnosticsStore {
  private readonly entries: DiagnosticEntry[] = [];

  add(entry: DiagnosticEntry): void {
    this.entries.unshift(entry);
    this.entries.splice(MAX_DIAGNOSTIC_ENTRIES);
  }

  list(): DiagnosticEntry[] {
    return [...this.entries];
  }
}
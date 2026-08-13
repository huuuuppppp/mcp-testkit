import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface SnapshotOptions {
  /**
   * Directory where snapshot files are stored, relative to the current
   * working directory. Defaults to `__snapshots__`.
   */
  dir?: string;
  /**
   * Snapshot file name (without path). Defaults to
   * `<test-file-basename>.snap.json`.
   */
  file?: string;
  /**
   * When true, overwrite stored snapshots instead of asserting. Respects the
   * `UPDATE_SNAPSHOTS` / `SNAPSHOT_UPDATE` environment variables when not set.
   */
  update?: boolean;
}

function isUpdateMode(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const env = process.env.UPDATE_SNAPSHOTS ?? process.env.SNAPSHOT_UPDATE;
  return env === "1" || env === "true" || env === "all";
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function shouldUpdate(): boolean {
  return isUpdateMode();
}

/**
 * A framework-agnostic snapshot manager.
 *
 * Snapshots are stored as JSON files in a `__snapshots__` directory next to
 * (or relative to) the consuming test. Each snapshot is keyed by a name. Set
 * the `UPDATE_SNAPSHOTS=1` environment variable to update all snapshots
 * instead of asserting — matching the convention used by Vitest/Jest.
 *
 * @example
 * ```ts
 * const snap = createSnapshotStore({ file: "tools.snap.json" });
 * snap.expect("add tool schema", toolDefinition);
 * ```
 */
export class SnapshotStore {
  private readonly file: string;
  private readonly update: boolean;
  private data: Record<string, unknown>;
  private dirty = false;
  private readonly usedKeys = new Set<string>();

  constructor(options: SnapshotOptions = {}) {
    const dir = options.dir
      ? resolve(process.cwd(), options.dir)
      : resolve(process.cwd(), "__snapshots__");
    this.file = join(dir, options.file ?? "mcp-testkit.snap.json");
    this.update = shouldUpdate();
    this.data = this.load();
  }

  private load(): Record<string, unknown> {
    if (existsSync(this.file)) {
      try {
        return JSON.parse(readFileSync(this.file, "utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Assert that `value` matches the stored snapshot for `key`. On first run
   * (or in update mode) the snapshot is written.
   */
  expect(key: string, value: unknown): void {
    this.usedKeys.add(key);
    const serialized = stableSerialize(value);

    if (this.update || !(key in this.data)) {
      if (this.data[key] !== value) {
        this.data[key] = value;
        this.dirty = true;
      }
      if (this.update) {
        return;
      }
      // first run: record and do not fail
      return;
    }

    const stored = stableSerialize(this.data[key]);
    if (stored !== serialized) {
      const g = globalThis as unknown as {
        AssertionError?: new (message: string) => Error;
      };
      const Err = g.AssertionError ?? Error;
      throw new Err(
        `Snapshot mismatch for "${key}":\n--- stored\n${stored}\n+++ actual\n${serialized}`,
      );
    }
  }

  /** Persist any changes to disk. Safe to call multiple times. */
  save(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, stableSerialize(this.data) + "\n", "utf8");
    this.dirty = false;
  }

  /**
   * Remove stored snapshots that were not touched during this run (dead
   * snapshots). Call after all assertions, then {@link save}.
   */
  pruneUnused(): void {
    for (const key of Object.keys(this.data)) {
      if (!this.usedKeys.has(key)) {
        delete this.data[key];
        this.dirty = true;
      }
    }
  }
}

/**
 * Convenience factory for a {@link SnapshotStore}.
 *
 * Pair with an `afterEach`/`afterAll` hook to persist:
 *
 * ```ts
 * const snap = createSnapshotStore({ file: "server.snap.json" });
 * afterAll(() => snap.save());
 * ```
 */
export function createSnapshotStore(options?: SnapshotOptions): SnapshotStore {
  return new SnapshotStore(options);
}

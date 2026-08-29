import { Injectable } from '@nestjs/common';

export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<ReadinessResult>;
}

export interface ReadinessResult {
  readonly ok: boolean;
  /** Safe, non-sensitive detail. Surfaced in the readiness body. */
  readonly detail?: string;
}

/**
 * Registry of readiness indicators.
 *
 * Liveness answers "is this process running"; readiness answers "can it serve
 * traffic". They differ because a live process with an unreachable database
 * must be pulled out of the load balancer without being restarted.
 *
 * Phase A registers nothing: there are no external dependencies yet, so the
 * service is ready as soon as it is live. Phase B registers the database, at
 * which point readiness starts to mean something. Nothing here fakes a check
 * for a dependency that does not exist.
 */
@Injectable()
export class ReadinessRegistry {
  private readonly checks: ReadinessCheck[] = [];

  register(check: ReadinessCheck): void {
    this.checks.push(check);
  }

  get registered(): readonly string[] {
    return this.checks.map((check) => check.name);
  }

  async run(): Promise<{ ok: boolean; results: Record<string, ReadinessResult> }> {
    const results: Record<string, ReadinessResult> = {};
    let ok = true;

    for (const check of this.checks) {
      try {
        const result = await check.check();
        results[check.name] = result;
        if (!result.ok) {
          ok = false;
        }
      } catch (error) {
        // A throwing check is a failing check, never a crashing endpoint.
        results[check.name] = {
          ok: false,
          detail: error instanceof Error ? error.message : 'check threw',
        };
        ok = false;
      }
    }

    return { ok, results };
  }
}

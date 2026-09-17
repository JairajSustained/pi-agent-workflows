/**
 * Concurrency scheduler: bounds parallel agent execution.
 * Mirrors Claude's limits (≤16 concurrent, ≤1000 total per run).
 */

export class Scheduler {
  private running = 0;
  private spawned = 0;
  private queue: Array<() => void> = [];

  private readonly maxConcurrency: number;
  private readonly maxAgents: number;

  constructor(maxConcurrency: number, maxAgents: number) {
    this.maxConcurrency = maxConcurrency;
    this.maxAgents = maxAgents;
  }

  get activeCount(): number {
    return this.running;
  }

  get totalSpawned(): number {
    return this.spawned;
  }

  async schedule<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.spawned >= this.maxAgents) {
      throw new Error(
        `workflow agent cap reached (${this.maxAgents} agents). ` +
          `Refine the task or raise maxAgents. Failing agent: ${label}`,
      );
    }
    this.spawned++;
    if (this.running >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

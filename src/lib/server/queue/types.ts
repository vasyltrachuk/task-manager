export interface BullMqQueueLike {
  add: (jobName: string, payload: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
}

export interface BullMqWorkerLike {
  close: () => Promise<void>;
}

export interface BullMqModuleLike {
  Queue: new (
    name: string,
    options: {
      connection: unknown;
      defaultJobOptions?: Record<string, unknown>;
    }
  ) => BullMqQueueLike;
  Worker: new (
    name: string,
    processor: (job: { data: unknown }) => Promise<void>,
    options: { connection: unknown }
  ) => BullMqWorkerLike;
}

export interface RedisLike {
  quit(): Promise<void>;
}

export interface RedisConstructorLike {
  new (url: string): RedisLike;
}

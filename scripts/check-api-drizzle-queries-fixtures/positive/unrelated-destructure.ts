function runBackgroundJob({ execute: runQuery }: { execute(job: unknown): Promise<unknown> }) {
  return runQuery("send notification");
}

void runBackgroundJob;

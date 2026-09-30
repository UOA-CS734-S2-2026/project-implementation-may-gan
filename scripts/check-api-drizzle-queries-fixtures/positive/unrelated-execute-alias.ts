declare const backgroundJob: { execute(job: unknown): Promise<unknown> };

const runJob = backgroundJob.execute;
runJob("send notification");

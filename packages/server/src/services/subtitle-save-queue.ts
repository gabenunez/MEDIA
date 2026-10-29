let chain: Promise<void> = Promise.resolve();

/** Write or extract a single subtitle file before starting the next one. */
export function saveSubtitleOneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

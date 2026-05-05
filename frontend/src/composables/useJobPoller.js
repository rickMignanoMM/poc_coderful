export function useJobPoller(apiFetch) {
  async function pollJob(
    jobId,
    {
      intervalMs = 1500,
      onDone = () => {},
      onError = () => {},
      onLogs = null,
      onStream = null,
    } = {},
  ) {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/job/${jobId}`);
          const job = await res.json();

          if (onLogs && job.logs) onLogs(job.logs);
          if (onStream && job.streaming !== undefined) onStream(job.streaming);

          if (job.status === "completed") {
            clearInterval(interval);
            onDone(job.result);
            resolve();
          } else if (job.status === "failed") {
            clearInterval(interval);
            onError(job.error);
            resolve();
          }
        } catch {
          clearInterval(interval);
          onError("Errore di rete");
          resolve();
        }
      }, intervalMs);
    });
  }

  return { pollJob };
}

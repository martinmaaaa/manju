import fs from 'fs';
import {
  cancelJimengJobById,
  claimNextJimengJob,
  createJimengJob,
  getJimengJobById,
  markJimengJobFailed,
  markJimengJobSucceeded,
  requeueRunningJimengJobs,
  updateJimengJobProgress,
} from '../persistence.js';
import jimengService from './jimengService.js';

const IDLE_POLL_MS = 2000;
const ERROR_BACKOFF_MS = 5000;

let workerPromise = null;
const runningJobControllers = new Map();
const cancelledJobIds = new Set();

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function cleanupReferenceFiles(referenceFiles = []) {
  for (const file of referenceFiles) {
    if (!file?.path || !fs.existsSync(file.path)) {
      continue;
    }

    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.warn('[jimeng-job] Failed to remove reference file:', file.path, error.message);
    }
  }
}

async function syncJobProgress(jobId, update = {}) {
  if (cancelledJobIds.has(jobId)) {
    return;
  }

  await updateJimengJobProgress(jobId, {
    status: 'RUNNING',
    phase: update.phase ?? 'RUNNING',
    progress: update.progress ?? 0,
    error: null,
    metadata: update.message ? { message: update.message } : update.metadata,
  });
}

async function processJimengJob(job) {
  const abortController = new AbortController();
  runningJobControllers.set(job.id, abortController);

  await syncJobProgress(job.id, {
    phase: 'STARTING',
    progress: 5,
    message: 'Starting Jimeng worker.',
  });

  try {
    const result = await jimengService.generateVideo(job.prompt, job.referenceFiles ?? [], {
      modeId: job.metadata?.modeId,
      onProgress: async (update) => {
        await syncJobProgress(job.id, update);
      },
      signal: abortController.signal,
    });

    if (cancelledJobIds.has(job.id) || result.cancelled) {
      await cancelJimengJobById(job.id, {
        error: 'Jimeng job cancelled.',
        metadata: {
          message: 'Jimeng job cancelled.',
        },
      });
      return;
    }

    if (result.success && result.videoUrl) {
      await markJimengJobSucceeded(job.id, {
        videoUrl: result.videoUrl,
        metadata: {
          message: 'Jimeng video generated successfully.',
        },
      });
      return;
    }

    await markJimengJobFailed(job.id, {
      phase: 'FAILED',
      progress: 100,
      error: result.error || 'Jimeng job failed.',
      metadata: {
        message: result.error || 'Jimeng job failed.',
      },
    });
  } catch (error) {
    if (cancelledJobIds.has(job.id) || abortController.signal.aborted) {
      await cancelJimengJobById(job.id, {
        error: 'Jimeng job cancelled.',
        metadata: {
          message: 'Jimeng job cancelled.',
        },
      });
      return;
    }

    await markJimengJobFailed(job.id, {
      phase: 'FAILED',
      progress: 100,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    runningJobControllers.delete(job.id);
    cancelledJobIds.delete(job.id);
    await cleanupReferenceFiles(job.referenceFiles);
  }
}

async function runWorkerLoop() {
  for (;;) {
    try {
      const job = await claimNextJimengJob();
      if (!job) {
        await delay(IDLE_POLL_MS);
        continue;
      }

      await processJimengJob(job);
    } catch (error) {
      console.error('[jimeng-job] Worker loop error:', error);
      await delay(ERROR_BACKOFF_MS);
    }
  }
}

export function ensureJimengJobWorker() {
  if (!workerPromise) {
    workerPromise = runWorkerLoop().catch((error) => {
      console.error('[jimeng-job] Worker crashed:', error);
      workerPromise = null;
    });
  }

  return workerPromise;
}

export async function cancelJimengJob(jobId) {
  cancelledJobIds.add(jobId);

  const runningController = runningJobControllers.get(jobId);
  if (runningController) {
    runningController.abort();
  }

  return cancelJimengJobById(jobId, {
    error: 'Jimeng job cancelled.',
    metadata: {
      message: 'Jimeng job cancelled.',
    },
  });
}

export async function initializeJimengJobWorker() {
  await requeueRunningJimengJobs();
  ensureJimengJobWorker();
}

export async function enqueueJimengJob(payload) {
  const job = await createJimengJob(payload);
  ensureJimengJobWorker();
  return job;
}

export async function getJimengJobStatus(jobId) {
  return getJimengJobById(jobId);
}

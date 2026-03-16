import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Film,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import {
  cancelGenerationJob,
  listProjectGenerationJobs,
  requeueGenerationJob,
  retryGenerationJob,
  type GenerationJob,
} from '../../../services/api/generationJobApi';
import type { WorkflowInstance, WorkflowProjectState } from '../../../services/workflow/domain/types';

interface WorkflowJobsViewProps {
  projectId?: string | null;
  projectTitle: string;
  workflowState: WorkflowProjectState;
  onOpenEpisodeWorkspace?: (episodeId: string) => void | Promise<void>;
  onRunJobAction?: (job: GenerationJob, action: JobAction) => Promise<JobActionResult>;
}

type JobStatusBucket = 'active' | 'completed' | 'failed' | 'cancelled' | 'other';
type JobStatusFilter = 'all' | JobStatusBucket;
type JobAction = 'cancel' | 'requeue' | 'retry';
type JobActionResult = { success: boolean; error?: string };

const ACTIVE_JOB_STATUSES = new Set([
  'queued',
  'pending',
  'claimed',
  'running',
  'working',
  'processing',
  'retrying',
  'in_progress',
]);

const COMPLETED_JOB_STATUSES = new Set(['completed', 'succeeded', 'success', 'done']);
const FAILED_JOB_STATUSES = new Set(['failed', 'error']);
const CANCELLED_JOB_STATUSES = new Set(['cancelled', 'canceled', 'aborted']);

function normalizeToken(value: string | undefined | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function getJobStatusBucket(status: string | undefined | null): JobStatusBucket {
  const normalized = normalizeToken(status);
  if (ACTIVE_JOB_STATUSES.has(normalized)) return 'active';
  if (COMPLETED_JOB_STATUSES.has(normalized)) return 'completed';
  if (FAILED_JOB_STATUSES.has(normalized)) return 'failed';
  if (CANCELLED_JOB_STATUSES.has(normalized)) return 'cancelled';
  return 'other';
}

function toTitleCase(value: string | undefined | null): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) return 'Unknown';

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) return 'Not available';

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Not available';

  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clampProgress(value: number | undefined | null): number {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function truncateText(value: string | undefined | null, maxLength = 140): string {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text || 'No prompt';
  return `${text.slice(0, maxLength - 1)}...`;
}

function getStatusClassName(bucket: JobStatusBucket): string {
  switch (bucket) {
    case 'active':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-50';
    case 'completed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-50';
    case 'failed':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-50';
    case 'cancelled':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-200';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function getProviderClassName(provider: string): string {
  switch (normalizeToken(provider)) {
    case 'jimeng':
      return 'border-sky-500/20 bg-sky-500/10 text-sky-50';
    case 'sora':
      return 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-50';
    case 'gemini':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-50';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function resolveJobTarget(
  job: GenerationJob,
  instanceById: Map<string, WorkflowInstance>,
): {
  label: string;
  scopeLabel: string;
  seriesTitle?: string;
  episodeId?: string;
} {
  if (!job.workflowInstanceId) {
    return {
      label: 'Project level task',
      scopeLabel: 'Project',
    };
  }

  const instance = instanceById.get(job.workflowInstanceId);
  if (!instance) {
    return {
      label: job.workflowInstanceId,
      scopeLabel: 'Workflow',
    };
  }

  if (instance.scope === 'episode') {
    const parentSeries = instance.parentInstanceId
      ? instanceById.get(instance.parentInstanceId)
      : null;

    return {
      label: instance.title,
      scopeLabel: 'Episode',
      seriesTitle: parentSeries?.title,
      episodeId: instance.id,
    };
  }

  if (instance.scope === 'series') {
    return {
      label: instance.title,
      scopeLabel: 'Series',
    };
  }

  return {
    label: instance.title,
    scopeLabel: 'Workflow',
  };
}

export const WorkflowJobsView: React.FC<WorkflowJobsViewProps> = ({
  projectId,
  projectTitle,
  workflowState,
  onOpenEpisodeWorkspace,
  onRunJobAction,
}) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobActionState, setJobActionState] = useState<{ jobId: string; action: JobAction } | null>(null);

  const instanceById = useMemo(
    () => new Map(workflowState.instances.map((instance) => [instance.id, instance])),
    [workflowState.instances],
  );

  useEffect(() => {
    if (!projectId) {
      setJobs([]);
      setIsLoading(false);
      setIsRefreshing(false);
      setError('Missing active project id.');
      return;
    }

    let disposed = false;

    const loadJobs = async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const response = await listProjectGenerationJobs(projectId, { limit: 200 });
      if (disposed) return;

      if (response.success) {
        const nextJobs = [...response.data].sort(
          (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
        );
        setJobs(nextJobs);
        setError(null);
      } else {
        setError(response.error ?? 'Failed to load generation jobs.');
      }

      if (!silent) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    };

    void loadJobs();
    const intervalId = window.setInterval(() => {
      void loadJobs(true);
    }, 15000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [projectId]);

  const providerOptions = useMemo(() => (
    Array.from(
      new Set(
        jobs
          .map((job) => job.provider)
          .filter((provider) => typeof provider === 'string' && provider.trim().length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right))
  ), [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return jobs.filter((job) => {
      if (providerFilter !== 'all' && normalizeToken(job.provider) !== normalizeToken(providerFilter)) {
        return false;
      }

      const bucket = getJobStatusBucket(job.status);
      if (statusFilter !== 'all' && bucket !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const target = resolveJobTarget(job, instanceById);
      const searchValue = [
        job.prompt,
        job.provider,
        job.capability,
        job.model,
        job.status,
        job.phase,
        target.label,
        target.seriesTitle,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');

      return searchValue.includes(normalizedQuery);
    });
  }, [instanceById, jobs, providerFilter, query, statusFilter]);

  useEffect(() => {
    if (filteredJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId],
  );

  const summary = useMemo(() => {
    const totals = jobs.reduce(
      (accumulator, job) => {
        const bucket = getJobStatusBucket(job.status);
        accumulator.total += 1;
        accumulator[bucket] += 1;
        if (job.resultUrl) {
          accumulator.withResult += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        other: 0,
        withResult: 0,
      },
    );

    return totals;
  }, [jobs]);

  const activeJobs = useMemo(
    () => filteredJobs.filter((job) => getJobStatusBucket(job.status) === 'active').slice(0, 4),
    [filteredJobs],
  );

  const refreshJobsList = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    const response = await listProjectGenerationJobs(projectId, { limit: 200 });
    if (response.success) {
      setJobs(
        [...response.data].sort(
          (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
        ),
      );
      setError(null);
      return true;
    }

    setError(response.error ?? 'Failed to refresh generation jobs.');
    return false;
  }, [projectId]);

  const handleJobAction = useCallback(async (job: GenerationJob, action: JobAction) => {
    setJobActionState({ jobId: job.id, action });
    setIsRefreshing(true);

    try {
      let result: JobActionResult;
      if (onRunJobAction) {
        result = await onRunJobAction(job, action);
      } else {
        const response = action === 'cancel'
          ? await cancelGenerationJob(job.id)
          : action === 'requeue'
            ? await requeueGenerationJob(job.id)
            : await retryGenerationJob(job.id);
        result = response.success
          ? { success: true }
          : { success: false, error: response.error ?? `Failed to ${action} generation job.` };
      }

      if (!result.success) {
        setError(result.error ?? `Failed to ${action} generation job.`);
      }

      await refreshJobsList();
    } finally {
      setJobActionState(null);
      setIsRefreshing(false);
    }
  }, [onRunJobAction, refreshJobsList]);

  return (
    <div className="space-y-6">
      <section className="tianti-hero-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Task Center</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Generation jobs for {projectTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              This page tracks queued, running, completed, and failed generation work across the current
              project. Jobs are mapped back to series and episode instances so the execution layer is
              visible from the workflow shell.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!projectId) return;
              setIsRefreshing(true);
              void refreshJobsList().finally(() => setIsRefreshing(false));
            }}
            className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <JobSummaryCard
            label="Active jobs"
            value={String(summary.active)}
            hint={`${summary.total} total`}
            highlight
            icon={<Activity className="h-4 w-4" />}
          />
          <JobSummaryCard
            label="Completed"
            value={String(summary.completed)}
            hint={`${summary.withResult} with results`}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <JobSummaryCard
            label="Failed"
            value={String(summary.failed)}
            hint={summary.failed > 0 ? 'Needs review' : 'No failures'}
            icon={<TriangleAlert className="h-4 w-4" />}
          />
          <JobSummaryCard
            label="Cancelled"
            value={String(summary.cancelled)}
            hint={jobs[0] ? `Latest update ${formatDateTime(jobs[0].updated_at)}` : 'No job history yet'}
            icon={<Clock3 className="h-4 w-4" />}
          />
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_220px_220px]">
          <label className="block">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40">
              <Search className="h-4 w-4" />
              Search
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Prompt, provider, episode, series"
              className="tianti-input w-full px-4 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">Provider</div>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="tianti-input w-full px-4 py-2.5 text-sm"
            >
              <option value="all">All providers</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {toTitleCase(provider)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">Status</div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as JobStatusFilter)}
              className="tianti-input w-full px-4 py-2.5 text-sm"
            >
              <option value="all">All jobs</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <section className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm leading-7 text-rose-50">
          {error}
        </section>
      ) : null}

      {isLoading ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <section className="tianti-surface rounded-[30px] p-6">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`job-skeleton-${index}`}
                  className="h-28 animate-pulse rounded-[22px] border border-white/10 bg-white/[0.04]"
                />
              ))}
            </div>
          </section>
          <section className="tianti-surface rounded-[30px] p-6">
            <div className="h-[420px] animate-pulse rounded-[22px] border border-white/10 bg-white/[0.04]" />
          </section>
        </div>
      ) : filteredJobs.length === 0 ? (
        <section className="tianti-surface rounded-[30px] border border-dashed border-white/10 p-10 text-center">
          <div className="mx-auto max-w-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
              <Activity className="h-8 w-8" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-white">No matching jobs</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {jobs.length === 0
                ? 'This project has not created any generation jobs yet.'
                : 'The current filters removed all job results.'}
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="space-y-6">
            {activeJobs.length > 0 ? (
              <section className="tianti-surface rounded-[30px] p-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                  <Activity className="h-4 w-4 text-cyan-200" />
                  Active queue
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {activeJobs.map((job) => (
                    <CompactActiveJobCard
                      key={job.id}
                      job={job}
                      target={resolveJobTarget(job, instanceById)}
                      isSelected={job.id === selectedJobId}
                      onSelect={() => setSelectedJobId(job.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="tianti-surface rounded-[30px] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">Recent jobs</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">
                    {filteredJobs.length} visible jobs. Auto refresh runs every 15 seconds while this view is open.
                  </div>
                </div>
                <div className="text-xs text-slate-400">Showing latest 200 records</div>
              </div>

              <div className="mt-5 space-y-3">
                {filteredJobs.map((job) => {
                  const target = resolveJobTarget(job, instanceById);
                  const bucket = getJobStatusBucket(job.status);
                  const progress = clampProgress(job.progress);

                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        job.id === selectedJobId
                          ? 'border-cyan-500/30 bg-cyan-500/10 shadow-[0_16px_40px_rgba(34,211,238,0.08)]'
                          : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getStatusClassName(bucket)}`}>
                              {toTitleCase(job.status)}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getProviderClassName(job.provider)}`}>
                              {toTitleCase(job.provider)}
                            </span>
                            <span className="tianti-chip">{toTitleCase(job.capability)}</span>
                            <span className="tianti-chip">{target.scopeLabel}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-white">{target.label}</div>
                            {target.seriesTitle ? (
                              <span className="text-xs text-slate-400">in {target.seriesTitle}</span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            {truncateText(job.prompt, 180)}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                            <span>Phase {toTitleCase(job.phase)}</span>
                            <span>Attempts {job.attempts}</span>
                            <span>Updated {formatDateTime(job.updated_at)}</span>
                            {job.model ? <span>Model {job.model}</span> : null}
                          </div>
                        </div>

                        <div className="w-full max-w-[180px]">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className={`h-full rounded-full ${
                                bucket === 'failed'
                                  ? 'bg-gradient-to-r from-rose-400 to-orange-400'
                                  : bucket === 'completed'
                                    ? 'bg-gradient-to-r from-emerald-400 to-cyan-300'
                                    : 'bg-gradient-to-r from-cyan-300 to-sky-400'
                              }`}
                              style={{ width: `${Math.max(progress, bucket === 'active' ? 8 : 0)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="xl:sticky xl:top-0 xl:h-fit">
            <section className="tianti-surface rounded-[30px] p-5">
              {selectedJob ? (
                <JobDetailPanel
                  job={selectedJob}
                  target={resolveJobTarget(selectedJob, instanceById)}
                  onOpenEpisodeWorkspace={onOpenEpisodeWorkspace}
                  onRunJobAction={handleJobAction}
                  pendingAction={jobActionState && jobActionState.jobId === selectedJob.id ? jobActionState.action : null}
                />
              ) : (
                <div className="rounded-[22px] border border-dashed border-white/10 p-6 text-sm leading-7 text-slate-400">
                  Select a job to inspect its prompt, scope, progress, and output.
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};

const JobSummaryCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
  icon: React.ReactNode;
}> = ({
  label,
  value,
  hint,
  highlight = false,
  icon,
}) => (
  <div
    className={`rounded-[22px] px-4 py-4 ${
      highlight
        ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-50 shadow-[0_16px_40px_rgba(73,200,255,0.12)]'
        : 'tianti-stat-card text-white'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-white/70">{icon}</div>
    </div>
    <div className="mt-2 text-2xl font-semibold">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{hint}</div>
  </div>
);

const CompactActiveJobCard: React.FC<{
  job: GenerationJob;
  target: ReturnType<typeof resolveJobTarget>;
  isSelected: boolean;
  onSelect: () => void;
}> = ({
  job,
  target,
  isSelected,
  onSelect,
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`rounded-[22px] border p-4 text-left transition ${
      isSelected
        ? 'border-cyan-500/30 bg-cyan-500/10'
        : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.03]'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-50">
        {toTitleCase(job.status)}
      </span>
      <span className="text-xs text-slate-400">{clampProgress(job.progress)}%</span>
    </div>
    <div className="mt-3 text-base font-semibold text-white">{target.label}</div>
    <div className="mt-2 text-sm leading-6 text-slate-300">{truncateText(job.prompt, 100)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
      <span>{toTitleCase(job.provider)}</span>
      <span>{toTitleCase(job.phase)}</span>
      <span>{formatDateTime(job.updated_at)}</span>
    </div>
  </button>
);

const JobDetailPanel: React.FC<{
  job: GenerationJob;
  target: ReturnType<typeof resolveJobTarget>;
  onOpenEpisodeWorkspace?: (episodeId: string) => void | Promise<void>;
  onRunJobAction?: (job: GenerationJob, action: JobAction) => Promise<void>;
  pendingAction?: JobAction | null;
}> = ({
  job,
  target,
  onOpenEpisodeWorkspace,
  onRunJobAction,
  pendingAction,
}) => {
  const bucket = getJobStatusBucket(job.status);
  const isActionPending = Boolean(pendingAction);
  const canCancel = bucket === 'active';
  const canRequeue = bucket === 'failed' || bucket === 'cancelled';
  const canRetry = bucket !== 'active';
  const metadataEntries = Object.entries(job.metadata ?? {}).filter(([, value]) => value !== undefined && value !== null);
  const sourcePayloadEntries = Object.entries(job.sourcePayload ?? {}).filter(([, value]) => value !== undefined && value !== null);
  const resultPayloadEntries = Object.entries(job.resultPayload ?? {}).filter(([, value]) => value !== undefined && value !== null);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getStatusClassName(bucket)}`}>
            {toTitleCase(job.status)}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getProviderClassName(job.provider)}`}>
            {toTitleCase(job.provider)}
          </span>
          <span className="tianti-chip">{toTitleCase(job.capability)}</span>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-white">{target.label}</h3>
        <div className="mt-2 text-sm text-slate-400">
          {target.seriesTitle ? `${target.scopeLabel} in ${target.seriesTitle}` : target.scopeLabel}
        </div>
      </div>

      <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-white/40">Prompt</div>
        <div className="mt-3 text-sm leading-7 text-slate-200">{job.prompt || 'No prompt'}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailMetric label="Progress" value={`${clampProgress(job.progress)}%`} />
        <DetailMetric label="Attempts" value={String(job.attempts)} />
        <DetailMetric label="Phase" value={toTitleCase(job.phase)} />
        <DetailMetric label="Updated" value={formatDateTime(job.updated_at)} />
        <DetailMetric label="Created" value={formatDateTime(job.created_at)} />
        <DetailMetric label="Model" value={job.model || 'Default'} />
      </div>

      {job.error ? (
        <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-50">
            <TriangleAlert className="h-4 w-4" />
            Error
          </div>
          <div className="mt-2 text-sm leading-7 text-rose-100/90">{job.error}</div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {target.episodeId && onOpenEpisodeWorkspace ? (
          <button
            type="button"
            onClick={() => {
              void onOpenEpisodeWorkspace(target.episodeId!);
            }}
            className="tianti-button tianti-button-primary px-4 py-2 text-sm"
          >
            <Film className="h-4 w-4" />
            Open workspace
          </button>
        ) : null}

        {job.resultUrl ? (
          <button
            type="button"
            onClick={() => window.open(job.resultUrl, '_blank', 'noopener,noreferrer')}
            className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            Open result
          </button>
        ) : null}

        {canCancel && onRunJobAction ? (
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => {
              void onRunJobAction(job, 'cancel');
            }}
            className="tianti-button tianti-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${pendingAction === 'cancel' ? 'animate-spin' : ''}`} />
            Cancel
          </button>
        ) : null}

        {canRequeue && onRunJobAction ? (
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => {
              void onRunJobAction(job, 'requeue');
            }}
            className="tianti-button tianti-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${pendingAction === 'requeue' ? 'animate-spin' : ''}`} />
            Requeue
          </button>
        ) : null}

        {canRetry && onRunJobAction ? (
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => {
              void onRunJobAction(job, 'retry');
            }}
            className="tianti-button tianti-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${pendingAction === 'retry' ? 'animate-spin' : ''}`} />
            Retry
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        <DetailList title="Reference files" values={job.referenceFiles.map((file) => file.originalname)} emptyLabel="No reference files" />
        <DetailList title="Metadata" values={metadataEntries.map(([key, value]) => `${key}: ${String(value)}`)} emptyLabel="No metadata" />
        <DetailList title="Input payload" values={sourcePayloadEntries.map(([key, value]) => `${key}: ${String(value)}`)} emptyLabel="No input payload" />
        <DetailList title="Result payload" values={resultPayloadEntries.map(([key, value]) => `${key}: ${String(value)}`)} emptyLabel="No result payload" />
      </div>
    </div>
  );
};

const DetailMetric: React.FC<{
  label: string;
  value: string;
}> = ({
  label,
  value,
}) => (
  <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-sm font-medium text-white">{value}</div>
  </div>
);

const DetailList: React.FC<{
  title: string;
  values: string[];
  emptyLabel: string;
}> = ({
  title,
  values,
  emptyLabel,
}) => (
  <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{title}</div>
    {values.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={`${title}-${value}`} className="tianti-chip">
            {value}
          </span>
        ))}
      </div>
    ) : (
      <div className="mt-3 text-sm text-slate-400">{emptyLabel}</div>
    )}
  </div>
);

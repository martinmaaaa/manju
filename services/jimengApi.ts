const JIMENG_API_BASE = 'http://localhost:3001/api/jimeng';

export interface JimengGenerateOptions {
    prompt: string;
    files?: File[];
    projectId?: string;
    workflowInstanceId?: string;
}

export interface JimengLoginResult {
    success: boolean;
    error?: string;
}

export interface JimengJob {
    id: string;
    prompt: string;
    status: string;
    phase: string;
    progress: number;
    error?: string;
    videoUrl?: string;
    metadata?: Record<string, unknown>;
    attempts?: number;
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
}

export interface JimengJobResult {
    success: boolean;
    job?: JimengJob;
    error?: string;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapJob(payload: any): JimengJob | undefined {
    if (!payload || typeof payload !== 'object') {
        return undefined;
    }

    return {
        id: String(payload.id || ''),
        prompt: String(payload.prompt || ''),
        status: String(payload.status || ''),
        phase: String(payload.phase || ''),
        progress: Number(payload.progress ?? 0),
        error: typeof payload.error === 'string' ? payload.error : undefined,
        videoUrl: typeof payload.videoUrl === 'string' ? payload.videoUrl : undefined,
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : undefined,
        attempts: Number(payload.attempts ?? 0),
        created_at: String(payload.created_at || ''),
        updated_at: String(payload.updated_at || ''),
        started_at: typeof payload.started_at === 'string' ? payload.started_at : undefined,
        completed_at: typeof payload.completed_at === 'string' ? payload.completed_at : undefined,
    };
}

export const jimengApi = {
    async login(): Promise<JimengLoginResult> {
        try {
            const res = await fetch(`${JIMENG_API_BASE}/login`);
            const data = await res.json();
            return {
                success: Boolean(data.success),
                error: typeof data.error === 'string' ? data.error : undefined,
            };
        } catch (error) {
            console.error('Jimeng login error:', error);
            return { success: false, error: '无法连接本地 Jimeng 服务。' };
        }
    },

    async createVideoJob(options: JimengGenerateOptions): Promise<JimengJobResult> {
        try {
            const formData = new FormData();
            formData.append('prompt', options.prompt);

            if (options.projectId) {
                formData.append('projectId', options.projectId);
            }

            if (options.workflowInstanceId) {
                formData.append('workflowInstanceId', options.workflowInstanceId);
            }

            if (options.files && options.files.length > 0) {
                options.files.forEach((file) => {
                    formData.append('files', file);
                });
            }

            const res = await fetch(`${JIMENG_API_BASE}/jobs/seedance2`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            return {
                success: Boolean(data.success),
                job: mapJob(data.data),
                error: typeof data.error === 'string' ? data.error : undefined,
            };
        } catch (error: any) {
            console.error('Jimeng create job error:', error);
            return { success: false, error: error?.message || '创建 Jimeng 任务失败。' };
        }
    },

    async getJob(jobId: string): Promise<JimengJobResult> {
        try {
            const res = await fetch(`${JIMENG_API_BASE}/jobs/${jobId}`);
            const data = await res.json();

            return {
                success: Boolean(data.success),
                job: mapJob(data.data),
                error: typeof data.error === 'string' ? data.error : undefined,
            };
        } catch (error: any) {
            console.error('Jimeng get job error:', error);
            return { success: false, error: error?.message || '获取 Jimeng 任务状态失败。' };
        }
    },

    async generateVideo(options: JimengGenerateOptions): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
        const created = await jimengApi.createVideoJob(options);
        if (!created.success || !created.job) {
            return { success: false, error: created.error || '创建 Jimeng 任务失败。' };
        }

        const result = await jimengApi.waitForJobCompletion(created.job.id);
        if (!result.success || !result.job) {
            return { success: false, error: result.error || '获取 Jimeng 任务结果失败。' };
        }

        if (result.job.status !== 'SUCCEEDED' || !result.job.videoUrl) {
            return { success: false, error: result.job.error || '即梦任务未成功完成。' };
        }

        return {
            success: true,
            videoUrl: result.job.videoUrl,
        };
    },

    async waitForJobCompletion(
        jobId: string,
        options: {
            intervalMs?: number;
            signal?: AbortSignal;
            onUpdate?: (job: JimengJob) => void | Promise<void>;
        } = {},
    ): Promise<JimengJobResult> {
        const intervalMs = options.intervalMs ?? 3000;

        for (;;) {
            if (options.signal?.aborted) {
                throw new Error('任务已取消');
            }

            const result = await jimengApi.getJob(jobId);
            if (!result.success || !result.job) {
                return result;
            }

            if (options.onUpdate) {
                await options.onUpdate(result.job);
            }

            if (result.job.status === 'SUCCEEDED' || result.job.status === 'FAILED') {
                return result;
            }

            await sleep(intervalMs);
        }
    },
};

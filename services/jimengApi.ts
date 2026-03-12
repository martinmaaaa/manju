export interface JimengGenerateOptions {
    prompt: string;
    files?: File[];
}

export const jimengApi = {
    /**
     * 触发本地控制台弹出即梦可见登录窗口
     */
    async login(): Promise<boolean> {
        try {
            const res = await fetch('http://localhost:3001/api/jimeng/login');
            const data = await res.json();
            return data.success;
        } catch (error) {
            console.error('Jimeng login error:', error);
            return false;
        }
    },

    /**
     * 提交文本和文件参考到本地即梦服务进行 Seedance 2.0 生成
     */
    async generateVideo(options: JimengGenerateOptions): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
        try {
            const formData = new FormData();
            formData.append('prompt', options.prompt);

            if (options.files && options.files.length > 0) {
                options.files.forEach(file => {
                    formData.append('files', file);
                });
            }

            const res = await fetch('http://localhost:3001/api/jimeng/generate/seedance2', {
                method: 'POST',
                body: formData,
            });

            return await res.json();
        } catch (error: any) {
            console.error('Jimeng generate error:', error);
            return { success: false, error: error.message };
        }
    }
};

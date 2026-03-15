import React, { useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, QrCode, Smartphone } from 'lucide-react';
import { jimengApi } from '../../services/jimengApi';

export const JimengSettingsTab: React.FC = () => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginStatus, setLoginStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [loginMessage, setLoginMessage] = useState('');

    const handleLogin = async () => {
        setIsLoggingIn(true);
        setLoginStatus('idle');
        setLoginMessage('');

        const result = await jimengApi.login();
        if (result.success) {
            setLoginStatus('success');
            setLoginMessage('即梦登录状态已就绪。');
        } else {
            setLoginStatus('error');
            setLoginMessage(result.error || '登录未完成或已取消。');
        }

        setIsLoggingIn(false);
    };

    return (
        <div className="p-8 space-y-6">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-white">即梦账号连接</h3>
                    <p className="text-sm text-slate-400 mt-1">
                        系统会在你的本地环境里通过浏览器自动化连接即梦网页，使用你自己的登录态提交视频任务。
                    </p>
                </div>

                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <QrCode size={120} />
                    </div>

                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl">
                                <Smartphone size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-base">扫码登录</h4>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[80%]">
                                    点击下方按钮后，会打开一个真实浏览器窗口进入即梦官网。扫码成功后，登录状态会保存在本地浏览器配置中。
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 flex items-center justify-between gap-4">
                            <button
                                onClick={handleLogin}
                                disabled={isLoggingIn}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoggingIn ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        请在弹出的窗口中扫码...
                                    </>
                                ) : (
                                    <>
                                        <ExternalLink size={18} />
                                        一键扫码登录即梦
                                    </>
                                )}
                            </button>

                            {loginStatus === 'success' && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium">
                                    <CheckCircle size={16} />
                                    <span>{loginMessage}</span>
                                </div>
                            )}

                            {loginStatus === 'error' && (
                                <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium">
                                    {loginMessage}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-2">
                    <p className="text-xs text-cyan-300 leading-relaxed">
                        现在即梦节点已经切到异步任务模式：前端提交任务后，会立刻拿到任务编号，由本地 sidecar 后台轮询结果。
                    </p>
                    <p className="text-xs text-cyan-300 leading-relaxed">
                        如果即梦账号排队较久，节点会持续显示任务状态，而不是像之前那样卡死在一次同步请求里。
                    </p>
                </div>

                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                    <p className="text-xs text-orange-300 leading-relaxed">
                        注意：该能力依赖你自己的即梦登录状态、账号权限、排队与审核规则。自动化提交不会绕过平台的额度、风控或会员限制。
                    </p>
                </div>
            </div>
        </div>
    );
};

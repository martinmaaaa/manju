import React, { useState } from 'react';
import { QrCode, CheckCircle, Smartphone, ExternalLink, Loader2 } from 'lucide-react';
import { jimengApi } from '../../services/jimengApi';

export const JimengSettingsTab: React.FC = () => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginStatus, setLoginStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleLogin = async () => {
        setIsLoggingIn(true);
        setLoginStatus('idle');
        const success = await jimengApi.login();
        if (success) {
            setLoginStatus('success');
        } else {
            setLoginStatus('error');
        }
        setIsLoggingIn(false);
    };

    return (
        <div className="p-8 space-y-6">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        即梦 (Jimeng) 账号授权
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                        为了访问 Seedance 2.0 并支持多模态参考上传，系统会在本地环境中通过安全隔离的无头浏览器对接即梦官网。
                    </p>
                </div>

                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4 relative overflow-hidden">
                    {/* 装饰 */}
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <QrCode size={120} />
                    </div>

                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl">
                                <Smartphone size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-base">安全扫码登录</h4>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[80%]">
                                    点击下方按钮，系统将弹出一个真实的浏览器窗口打开即梦官网。
                                    请使用抖音/即梦 App 扫码登录。登录成功后关闭浏览器，登录状态将自动永久保存在您的本地设备上。
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 flex items-center justify-between">
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
                                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium animate-in fade-in zoom-in">
                                    <CheckCircle size={16} />
                                    <span>授权成功，已就绪</span>
                                </div>
                            )}
                            {loginStatus === 'error' && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium animate-in fade-in zoom-in">
                                    <span>授权异常或已取消</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                    <p className="text-xs text-orange-400 leading-relaxed">
                        <strong>免责声明：</strong>
                        本功能通过本地自动化脚本对接即梦官网，仅供个人学习或提效使用。
                        所有数据均直接发送至官方接口，绝不会上传至任何第三方服务器，账号安全性由完整的本地沙箱保障。
                    </p>
                </div>
            </div>
        </div>
    );
};

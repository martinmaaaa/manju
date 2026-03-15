import React from 'react';
import { X } from 'lucide-react';

interface SidebarPanelShellProps {
    title: string;
    onClose: () => void;
    action?: React.ReactNode;
    headerContent?: React.ReactNode;
    bodyClassName?: string;
    children: React.ReactNode;
}

export const SidebarPanelShell: React.FC<SidebarPanelShellProps> = ({
    title,
    onClose,
    action,
    headerContent,
    bodyClassName = 'flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2',
    children,
}) => {
    return (
        <>
            <div className="p-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                    <span className="flex-1 text-center text-xs font-bold uppercase tracking-widest text-white/50">
                        {title}
                    </span>
                    <div className="min-w-[14px] flex justify-end">
                        {action ?? <span className="w-[14px] h-[14px]" aria-hidden="true" />}
                    </div>
                </div>
                {headerContent && <div className="mt-3">{headerContent}</div>}
            </div>
            <div className={bodyClassName}>{children}</div>
        </>
    );
};

import React, { useRef, useEffect, useCallback, ReactNode, forwardRef } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

interface CanvasWorkspaceProps {
    children: ReactNode;
    onContextMenu?: (e: React.MouseEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseUp?: (e: React.MouseEvent) => void;
}

/**
 * 提取自 App.tsx: 处理画布平移、缩放、鼠标事件以及事件拦截的顶层容器层。
 */
export const CanvasWorkspace = forwardRef<HTMLDivElement, CanvasWorkspaceProps>(
    ({ children, onContextMenu, onMouseDown, onMouseUp }, ref) => {
        const {
            pan,
            scale,
            isDraggingCanvas,
            zoomCanvas,
            setPan,
            setIsDraggingCanvas,
            setMousePos
        } = useCanvasStore();

        const canvasRef = useRef<HTMLDivElement>(null);

        // Merge refs
        const setRefs = useCallback(
            (node: HTMLDivElement | null) => {
                canvasRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
                }
            },
            [ref]
        );

        const rafRef = useRef<number | null>(null);

        // -------- Wheel: Zoom and Pan --------
        const handleWheel = useCallback((e: WheelEvent) => {
            // 如果是在节点内部滚轮滑动（如文本框或列表），不移动画布
            const target = e.target as HTMLElement;
            const nodeElement = target.closest('[data-node-container]');
            if (nodeElement) return;

            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = -e.deltaY * 0.001;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                zoomCanvas(delta, x, y);
            } else {
                setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
            }
        }, [zoomCanvas, setPan]);

        // Attach non-passive wheel event
        useEffect(() => {
            const element = canvasRef.current;
            if (!element) return;

            const handleWheelEvent = (e: WheelEvent) => {
                handleWheel(e);
            };

            element.addEventListener('wheel', handleWheelEvent, { passive: false });

            return () => {
                element.removeEventListener('wheel', handleWheelEvent);
            };
        }, [handleWheel]);

        const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
            onMouseDown?.(e);
        }, [onMouseDown]);

        return (
            <div
                ref={setRefs}
                className={`absolute inset-0 overflow-hidden bg-[#0A0A0A] ${isDraggingCanvas ? 'cursor-grabbing' : ''}`}
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
                    backgroundSize: '40px 40px',
                    backgroundPosition: `${pan.x}px ${pan.y}px`
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={onMouseUp}
                onContextMenu={onContextMenu}
            >
                <div
                    className="absolute inset-0 origin-top-left transition-transform duration-75"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
                    }}
                >
                    {children}
                </div>
            </div>
        );
    }
);

import React from 'react';
import type { CanvasNode } from '../../types/workflowApp';

interface CanvasSurfaceProps {
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onChangeNodes: (nodes: CanvasNode[]) => void;
}

const NODE_COLORS: Record<CanvasNode['type'], string> = {
  text: 'from-cyan-500/20 to-cyan-950/80 border-cyan-400/30',
  image: 'from-amber-500/20 to-amber-950/80 border-amber-400/30',
  audio: 'from-emerald-500/20 to-emerald-950/80 border-emerald-400/30',
  video: 'from-fuchsia-500/20 to-fuchsia-950/80 border-fuchsia-400/30',
};

export const CanvasSurface: React.FC<CanvasSurfaceProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onChangeNodes,
}) => {
  const updateNode = (nodeId: string, patch: Partial<CanvasNode>) => {
    onChangeNodes(nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
  };

  return (
    <div className="relative min-h-[720px] overflow-hidden rounded-[32px] border border-white/10 bg-[#07090d] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0), linear-gradient(180deg, rgba(255,255,255,0.02), transparent 20%)',
          backgroundSize: '28px 28px, 100% 100%',
        }}
      />

      <div className="relative h-full min-h-[720px]">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`absolute rounded-[28px] border bg-gradient-to-br p-0 text-left transition ${
              NODE_COLORS[node.type]
            } ${selectedNodeId === node.id ? 'ring-2 ring-white/60' : 'hover:border-white/20'}`}
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
            }}
            onClick={() => onSelectNode(node.id)}
          >
            <div className="flex h-full flex-col rounded-[27px] bg-black/45 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.32em] text-white/45">{node.type}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{node.title}</div>
                </div>
                <div className="text-[11px] text-white/45">{node.width}×{node.height}</div>
              </div>
              <textarea
                value={node.content}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateNode(node.id, { content: event.target.value })}
                className="mt-4 h-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none focus:border-white/30"
                placeholder="在这里写入当前节点内容..."
              />
            </div>
          </button>
        ))}

        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md rounded-[28px] border border-dashed border-white/15 bg-black/30 px-8 py-10 text-center">
              <div className="text-xs uppercase tracking-[0.34em] text-white/35">Canvas</div>
              <h3 className="mt-3 text-2xl font-semibold text-white">多模态工作区</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                在上方添加文本、图片、音频或视频节点，把当前集的素材和思路组织成可执行画布。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

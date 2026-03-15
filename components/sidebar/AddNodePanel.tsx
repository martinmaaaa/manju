import React from 'react';
import type { NodeType } from '../../types';
import { getNodeNameCN } from '../../utils/nodeHelpers';
import { SidebarPanelShell } from './SidebarPanelShell';
import { ADDABLE_NODE_TYPES, getNodeIcon } from './nodeCatalog';

interface AddNodePanelProps {
    onAddNode: (type: NodeType) => void;
    onClose: () => void;
}

export const AddNodePanel: React.FC<AddNodePanelProps> = ({ onAddNode, onClose }) => {
    return (
        <SidebarPanelShell title="添加节点" onClose={onClose}>
            {ADDABLE_NODE_TYPES.map((type) => {
                const ItemIcon = getNodeIcon(type);

                return (
                    <button
                        key={type}
                        type="button"
                        onClick={() => onAddNode(type)}
                        className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-200 transition-colors border border-transparent hover:border-white/5 hover:shadow-lg"
                    >
                        <div className="p-2 bg-white/10 rounded-lg text-cyan-200 shadow-inner">
                            <ItemIcon size={16} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-xs">{getNodeNameCN(type)}</span>
                        </div>
                    </button>
                );
            })}
        </SidebarPanelShell>
    );
};

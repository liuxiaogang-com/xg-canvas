import type { NodeSchema } from '../types';

export interface GridCell {
  asset_id: string | null;
}

export interface GridData {
  rows: number;
  cols: number;
  cells: GridCell[];
}

export const gridSchema: NodeSchema<GridData> = {
  type: 'grid',
  title: '宫格节点',
  category: 'compose',
  inputs: [{ id: 'in', type: 'image_list' }],
  outputs: [
    { id: 'out_grid', type: 'grid' },
    { id: 'out_list', type: 'image_list' },
  ],
  defaultData: { rows: 2, cols: 2, cells: Array(4).fill({ asset_id: null }) },
  pillActions: [
    { id: 'split_2x2', label: '2×2', icon: '⊞' },
    { id: 'split_3x3', label: '3×3', icon: '⊟' },
    { id: 'clear', label: '清空', icon: '×' },
  ],
  agentSuggestions: ['打乱顺序', '把第 1 格放到中心'],
  agentContext(data) {
    const filled = data.cells.filter((c) => c.asset_id).length;
    return `这是一个 ${data.rows}×${data.cols} 宫格，已填 ${filled} 格。`;
  },
};

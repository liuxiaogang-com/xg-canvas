import { useState } from 'react';

import { Segmented, Select } from '../../ui';
import { PALETTE } from '../../nodes/registry';
import GridSubview from './GridSubview';
import TableSubview from './TableSubview';

export default function ListView() {
  const [sub, setSub] = useState<'grid' | 'table'>('grid');
  const [filter, setFilter] = useState<string>('all');
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Segmented<'grid' | 'table'>
          value={sub}
          onChange={setSub}
          options={[
            { label: '宫格', value: 'grid' },
            { label: '表格', value: 'table' },
          ]}
        />
        <div style={{ width: 160 }}>
          <Select<string>
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: '全部类型' }, ...PALETTE.map((p) => ({ value: p.type, label: p.title }))]}
          />
        </div>
      </div>
      {sub === 'grid' ? <GridSubview filter={filter} /> : <TableSubview filter={filter} />}
    </div>
  );
}

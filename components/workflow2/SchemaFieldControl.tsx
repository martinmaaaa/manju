import React from 'react';
import type { CanvasConfigFieldDefinition } from '../../types/workflowApp';

interface SchemaFieldControlProps {
  fieldKey: string;
  definition: CanvasConfigFieldDefinition;
  value: unknown;
  onChange: (nextValue: string | number | boolean) => void;
}

export const SchemaFieldControl: React.FC<SchemaFieldControlProps> = ({
  fieldKey,
  definition,
  value,
  onChange,
}) => {
  const label = definition.label || fieldKey;

  if (definition.type === 'boolean') {
    return (
      <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-slate-200">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-transparent"
        />
      </label>
    );
  }

  if (Array.isArray(definition.enum) && definition.enum.length > 0) {
    return (
      <label className="grid gap-2 text-xs text-slate-300">
        <span>{label}</span>
        <select
          value={String(value ?? definition.default ?? definition.enum[0])}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
        >
          {definition.enum.map((item) => (
            <option key={String(item)} value={String(item)}>
              {String(item)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (definition.type === 'number') {
    return (
      <label className="grid gap-2 text-xs text-slate-300">
        <span>{label}</span>
        <input
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.step ?? 1}
          value={String(value ?? definition.default ?? '')}
          onChange={(event) => onChange(Number(event.target.value))}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
        />
      </label>
    );
  }

  return (
    <label className="grid gap-2 text-xs text-slate-300">
      <span>{label}</span>
      <input
        type="text"
        value={String(value ?? definition.default ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
      />
    </label>
  );
};

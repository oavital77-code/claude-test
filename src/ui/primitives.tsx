import React from 'react';

export function Card({
  children,
  className = '',
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-coal-700 bg-coal-900 shadow-lg shadow-black/20 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles: Record<string, string> = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white',
    secondary: 'bg-coal-700 hover:bg-coal-600 text-slate-100',
    ghost: 'bg-transparent hover:bg-coal-800 text-slate-300',
    danger: 'bg-alarm/90 hover:bg-alarm text-white',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      {label && <span className="text-sm text-slate-300">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-500' : 'bg-coal-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-0.5' : 'translate-x-5'
          }`}
        />
      </button>
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = '',
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-sm text-slate-300">
          <span>{label}</span>
          <span className="ltr-num font-mono text-slate-100" dir="ltr">
            {value.toFixed(step < 1 ? 1 : 0)}
            {unit}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-coal-700 accent-brand-500"
      />
    </div>
  );
}

export function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-sm text-slate-300">{label}</div>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-coal-600 bg-coal-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  unit,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-sm text-slate-300">{label}</div>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          dir="ltr"
          onChange={(e) => onChange(Number(e.target.value))}
          className="ltr-num w-full rounded-lg border border-coal-600 bg-coal-800 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none disabled:opacity-50"
        />
        {unit && <span className="shrink-0 text-xs text-slate-400">{unit}</span>}
      </div>
    </label>
  );
}

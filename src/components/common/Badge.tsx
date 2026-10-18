import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gold' | 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'zinc' | 'purple';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'zinc',
  size = 'md'
}) => {
  const variantStyles = {
    gold: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    zinc: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {children}
    </span>
  );
};

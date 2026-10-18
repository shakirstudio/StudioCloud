import React, { useState } from 'react';
import { Camera, X, Check, Building2, Sparkles, HardDrive } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../common/Badge';

interface NewStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT_PRESETS = [
  { name: 'Champagne Gold', hex: '#c5a059' },
  { name: 'Nordic Sage', hex: '#52796f' },
  { name: 'Obsidian Noir', hex: '#27272a' },
  { name: 'Royal Indigo', hex: '#31425f' },
];

export const NewStudioModal: React.FC<NewStudioModalProps> = ({ isOpen, onClose }) => {
  const { createNewStudio } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [accentColor, setAccentColor] = useState('#c5a059');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      setError('Studio brand name must be at least 2 characters long.');
      return;
    }

    if (!cleanSlug || cleanSlug.length < 2) {
      setError('Studio vanity slug must be at least 2 characters long.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createNewStudio(cleanName, cleanSlug, accentColor);
      onClose();
      setName('');
      setSlug('');
    } catch (err: any) {
      console.error('Error creating studio:', err);
      setError(err.message || 'Failed to register studio tenant');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: accentColor }}
            >
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Register Photography Studio
              </h2>
              <p className="text-xs text-zinc-500">
                New multi-tenant workspace with 10 GB allocation
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Studio Brand Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Aurelia Fine Art Studios"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Public Studio Slug *
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-r-0 border-zinc-200 dark:border-zinc-700 rounded-l-xl font-mono">
                studiocloud.io/p/
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full px-3 py-2 text-xs rounded-r-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Brand Accent Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => setAccentColor(p.hex)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-all ${
                    accentColor === p.hex
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-200 dark:border-zinc-800 opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: p.hex }} />
                  <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 truncate w-full">{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Allocation Guarantee */}
          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-between text-xs">
            <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-amber-500" /> Default Storage Allocation
            </span>
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              10.0 GB (Included)
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning Studio...' : 'Create Studio Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

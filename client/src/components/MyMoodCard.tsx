import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import { Mood, SetMoodRequest, PresetMood } from '../types.js';
import { getThemeStyles, getDefaultPresets } from '../presets.js';
import { useTranslation } from '../i18n/index.js';
import { api } from '../api.js';
import { ManagePresetsModal } from './ManagePresetsModal.js';

interface MyMoodCardProps {
  currentMood: Mood | null;
  onSetMood: (req: SetMoodRequest) => Promise<void>;
  onClearMood: () => Promise<void>;
  presets?: PresetMood[];
  onPresetsChange?: (presets: PresetMood[]) => void;
}

export const MyMoodCard: React.FC<MyMoodCardProps> = ({
  currentMood,
  onSetMood,
  onClearMood,
  presets: presetsProp,
  onPresetsChange,
}) => {
  const { t, language } = useTranslation();
  const [presets, setPresets] = useState<PresetMood[]>(() => {
    if (presetsProp && presetsProp.length > 0) return presetsProp;
    return getDefaultPresets(language);
  });
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetMood | null>(null);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const isDraftDirtyRef = useRef(false);
  const lastSyncedUpdatedAtRef = useRef<string | undefined>(undefined);

  // Synchronize when presetsProp changes from parent
  useEffect(() => {
    if (presetsProp && presetsProp.length > 0) {
      setPresets(presetsProp);
    }
  }, [presetsProp]);

  // Load user custom presets from API if presetsProp is not provided
  useEffect(() => {
    if (presetsProp) return;
    let active = true;

    api.getPresets(language)
      .then((data) => {
        const list: PresetMood[] = (data as any)?.presets || data;
        if (active && Array.isArray(list) && list.length > 0) {
          setPresets(list);
        }
      })
      .catch(() => {
        // Keep default presets already initialized in useState
      });

    return () => {
      active = false;
    };
  }, [language, presetsProp]);

  const presetsRef = useRef(presets);
  useEffect(() => {
    presetsRef.current = presets;
  }, [presets]);

  // Sync selectedPreset and draft note when currentMood changes
  useEffect(() => {
    if (currentMood) {
      const isNewTimestamp = currentMood.updated_at !== lastSyncedUpdatedAtRef.current;

      const match = presetsRef.current.find(
        (p) => p.emoji === currentMood.emoji && p.label === currentMood.label
      );
      if (isNewTimestamp || !selectedPreset) {
        if (match) {
          setSelectedPreset(match);
        } else {
          setSelectedPreset({
            emoji: currentMood.emoji,
            label: currentMood.label,
            colorTheme: currentMood.colorTheme || currentMood.color_theme || 'rose',
          });
        }
      }

      // Only update draft note if currentMood has a new timestamp or user has not modified draft
      if (isNewTimestamp || !isDraftDirtyRef.current) {
        setNote(currentMood.note || '');
        isDraftDirtyRef.current = false;
        lastSyncedUpdatedAtRef.current = currentMood.updated_at;
      }
    } else {
      if (!isDraftDirtyRef.current) {
        setSelectedPreset(null);
        setNote('');
        lastSyncedUpdatedAtRef.current = undefined;
      }
    }
  }, [currentMood]);

  const handleSelectPreset = (preset: PresetMood) => {
    setSelectedPreset(preset);
    isDraftDirtyRef.current = true;
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNote(e.target.value);
    isDraftDirtyRef.current = true;
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreset) return;

    setIsSubmitting(true);
    try {
      await onSetMood({
        emoji: selectedPreset.emoji,
        label: selectedPreset.label,
        note: note.trim() || undefined,
        colorTheme: selectedPreset.colorTheme || selectedPreset.color_theme || 'rose',
      });
      isDraftDirtyRef.current = false;
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 2500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!currentMood) return;
    setIsClearing(true);
    try {
      await onClearMood();
      setSelectedPreset(null);
      setNote('');
      isDraftDirtyRef.current = false;
      lastSyncedUpdatedAtRef.current = undefined;
    } finally {
      setIsClearing(false);
    }
  };

  const handlePresetsUpdated = (updated: PresetMood[]) => {
    setPresets(updated);
    if (onPresetsChange) {
      onPresetsChange(updated);
    }
  };

  return (
    <>
      <section className="bg-white/85 backdrop-blur-sm border border-[#E8E2D9] rounded-3xl p-6 sm:p-7 shadow-cozy">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8C827A] flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.myMoodCard.badge}</span>
              </span>

              {/* Manage Presets Button */}
              <button
                type="button"
                onClick={() => setIsManageOpen(true)}
                aria-label={t.myMoodCard.manage}
                title={t.myMoodCard.manage}
                className="inline-flex items-center space-x-1 text-[11px] font-semibold text-[#8C827A] hover:text-[#2D2825] px-2.5 py-0.5 rounded-lg bg-white/60 hover:bg-white hover:border-rose-300 active:scale-[0.96] transition-all border border-[#E8E2D9] shadow-cozy-xs"
              >
                <span>⚙️</span>
                <span>{t.myMoodCard.manage}</span>
              </button>
            </div>

            <h3 className="text-lg font-bold text-[#2D2825] mt-0.5 tracking-tight">
              {t.myMoodCard.title}
            </h3>
          </div>

          {currentMood && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing || isSubmitting}
              title={language === 'th' ? t.myMoodCard.clearStatus : 'Clear your current status'}
              className="flex items-center space-x-1 text-xs font-medium text-[#8C827A] hover:text-rose-600 px-2.5 py-1.5 rounded-xl hover:bg-rose-50 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isClearing ? t.myMoodCard.clearing : t.myMoodCard.clearStatus}</span>
            </button>
          )}
        </div>

        <form onSubmit={handleBroadcast}>
          {/* Presets Grid */}
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5 mb-5">
            {presets.map((preset, index) => {
              const isSelected = selectedPreset?.label === preset.label;
              const theme = getThemeStyles(preset.colorTheme || preset.color_theme);

              return (
                <button
                  key={`${preset.emoji}-${preset.label}-${index}`}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 active:scale-[0.94] ${
                    isSelected
                      ? `${theme.cardBg} ${theme.border} ring-2 ring-rose-400 shadow-cozy-sm scale-[1.02]`
                      : 'bg-[#FAF7F2]/80 border-[#E8E2D9] hover:bg-white hover:border-[#D6CEC4] hover:shadow-cozy-xs'
                  }`}
                >
                  <span className={`text-2xl sm:text-3xl mb-1 select-none transition-transform duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}>
                    {preset.emoji}
                  </span>
                  <span
                    className={`text-[11px] sm:text-xs font-semibold truncate max-w-full tracking-tight ${
                      isSelected ? theme.badgeText : 'text-[#2D2825]'
                    }`}
                  >
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Note Input */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-1.5">
              <label
                htmlFor="mood-note"
                className="text-xs font-semibold text-[#8C827A] uppercase tracking-wider"
              >
                {t.myMoodCard.noteLabel}
              </label>
              <span
                className={`text-xs font-mono tabular-nums ${
                  note.length >= 90 ? 'text-rose-500 font-bold' : 'text-[#8C827A]'
                }`}
              >
                {note.length}/100
              </span>
            </div>

            <div className="relative">
              <input
                id="mood-note"
                type="text"
                value={note}
                onChange={handleNoteChange}
                placeholder={t.myMoodCard.notePlaceholder}
                maxLength={100}
                className="w-full bg-[#FAF7F2] border border-[#E8E2D9] rounded-2xl px-4 py-2.5 text-sm text-[#2D2825] placeholder:text-[#8C827A]/60 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Submit Broadcast Button */}
          <button
            type="submit"
            disabled={!selectedPreset || isSubmitting}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-b from-[#2D2825] to-[#1C1917] hover:from-black hover:to-[#1C1917] text-[#FAF7F2] font-semibold text-sm shadow-md hover:shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-white/10"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 text-rose-400" />
                <span>{t.myMoodCard.broadcastButton}</span>
              </>
            )}
          </button>

          {/* Success confirmation toast */}
          {showSuccessToast && (
            <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center space-x-2 text-xs text-emerald-800 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-medium">{t.myMoodCard.sentSuccess}</span>
            </div>
          )}
        </form>
      </section>

      {/* Manage Presets Modal */}
      <ManagePresetsModal
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        presets={presets}
        onPresetsUpdated={handlePresetsUpdated}
      />
    </>
  );
};

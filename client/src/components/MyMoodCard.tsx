import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import { Mood, SetMoodRequest, PresetMood } from '../types.js';
import { PRESET_MOODS, getThemeStyles } from '../presets.js';

interface MyMoodCardProps {
  currentMood: Mood | null;
  onSetMood: (req: SetMoodRequest) => Promise<void>;
  onClearMood: () => Promise<void>;
}

export const MyMoodCard: React.FC<MyMoodCardProps> = ({
  currentMood,
  onSetMood,
  onClearMood,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<PresetMood | null>(null);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const isDraftDirtyRef = useRef(false);
  const lastSyncedUpdatedAtRef = useRef<string | undefined>(undefined);

  // Sync state when currentMood changes from props without overwriting active user typing
  useEffect(() => {
    if (currentMood) {
      const isNewTimestamp = currentMood.updated_at !== lastSyncedUpdatedAtRef.current;

      const match = PRESET_MOODS.find(
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
        colorTheme: selectedPreset.colorTheme,
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

  return (
    <section className="bg-white/80 border border-[#E8E2D9] rounded-3xl p-6 sm:p-7 shadow-cozy">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#8C827A] flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>My Mood</span>
          </span>
          <h3 className="text-lg font-bold text-[#2D2825] mt-0.5">
            How are you feeling right now?
          </h3>
        </div>

        {currentMood && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing || isSubmitting}
            title="Clear your current status"
            className="flex items-center space-x-1 text-xs text-[#8C827A] hover:text-rose-600 px-2.5 py-1.5 rounded-xl hover:bg-rose-50 active:scale-95 transition-all disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isClearing ? 'Clearing...' : 'Clear Status'}</span>
          </button>
        )}
      </div>

      <form onSubmit={handleBroadcast}>
        {/* Presets Grid */}
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5 mb-5">
          {PRESET_MOODS.map((preset) => {
            const isSelected = selectedPreset?.label === preset.label;
            const theme = getThemeStyles(preset.colorTheme);

            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border transition-all active:scale-95 ${
                  isSelected
                    ? `${theme.cardBg} ${theme.border} ring-2 ring-rose-400/80 shadow-xs`
                    : 'bg-[#FAF7F2]/80 border-[#E8E2D9] hover:bg-white hover:border-[#D6CEC4]'
                }`}
              >
                <span className="text-2xl sm:text-3xl mb-1 select-none">
                  {preset.emoji}
                </span>
                <span
                  className={`text-[11px] sm:text-xs font-semibold truncate max-w-full ${
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
              Add a note (optional)
            </label>
            <span
              className={`text-xs font-mono ${
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
              placeholder="e.g. dreaming of a latte, almost done with work..."
              maxLength={100}
              className="w-full bg-[#FAF7F2] border border-[#E8E2D9] rounded-2xl px-4 py-2.5 text-sm text-[#2D2825] placeholder:text-[#8C827A]/60 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Submit Broadcast Button */}
        <button
          type="submit"
          disabled={!selectedPreset || isSubmitting}
          className="w-full py-3.5 px-6 rounded-2xl bg-[#2D2825] hover:bg-black text-[#FAF7F2] font-semibold text-sm shadow-md flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 text-rose-400" />
              <span>Broadcast to Partner</span>
            </>
          )}
        </button>

        {/* Success confirmation toast */}
        {showSuccessToast && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center space-x-2 text-xs text-emerald-800 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">Mood sent to your partner!</span>
          </div>
        )}
      </form>
    </section>
  );
};

import React, { useState, useEffect } from 'react';
import { X, Trash2, Edit2, Plus, RotateCcw, Check } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';
import { api } from '../api.js';
import { PresetMood } from '../types.js';
import { getThemeStyles } from '../presets.js';

export interface ManagePresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: PresetMood[];
  onPresetsUpdated: (updatedPresets: PresetMood[]) => void;
}

const AVAILABLE_THEMES = ['rose', 'amber', 'indigo', 'purple', 'emerald', 'teal'] as const;

export const ManagePresetsModal: React.FC<ManagePresetsModalProps> = ({
  isOpen,
  onClose,
  presets: initialPresets,
  onPresetsUpdated,
}) => {
  const { t, language } = useTranslation();
  const [presets, setPresets] = useState<PresetMood[]>(initialPresets);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formEmoji, setFormEmoji] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formTheme, setFormTheme] = useState('rose');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when props change
  useEffect(() => {
    setPresets(initialPresets);
  }, [initialPresets]);

  // Reset internal form states when modal is closed/opened
  useEffect(() => {
    if (!isOpen) {
      setEditingIndex(null);
      setIsAdding(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    if (presets.length >= 16) {
      setError(t.manageModal.maxLimitAlert);
      return;
    }
    setEditingIndex(null);
    setFormEmoji('✨');
    setFormLabel('');
    setFormTheme('rose');
    setError(null);
    setIsAdding(true);
  };

  const handleStartEdit = (index: number) => {
    const item = presets[index];
    if (!item) return;
    setIsAdding(false);
    setEditingIndex(index);
    setFormEmoji(item.emoji);
    setFormLabel(item.label);
    setFormTheme(item.colorTheme || item.color_theme || 'rose');
    setError(null);
  };

  const handleCancelForm = () => {
    setEditingIndex(null);
    setIsAdding(false);
    setError(null);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmoji = formEmoji.trim();
    const trimmedLabel = formLabel.trim();

    if (!trimmedEmoji) {
      setError('Emoji is required');
      return;
    }
    if (!trimmedLabel) {
      setError('Label is required');
      return;
    }
    if (trimmedLabel.length > 30) {
      setError('Label must not exceed 30 characters');
      return;
    }

    let nextPresets: PresetMood[];
    if (isAdding) {
      if (presets.length >= 16) {
        setError(t.manageModal.maxLimitAlert);
        return;
      }
      nextPresets = [
        ...presets,
        {
          emoji: trimmedEmoji,
          label: trimmedLabel,
          colorTheme: formTheme,
        },
      ];
    } else if (editingIndex !== null) {
      nextPresets = presets.map((item, i) =>
        i === editingIndex
          ? {
              ...item,
              emoji: trimmedEmoji,
              label: trimmedLabel,
              colorTheme: formTheme,
            }
          : item
      );
    } else {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const saved = await api.savePresets(nextPresets);
      const updatedList: PresetMood[] = (saved as any)?.presets || saved;
      setPresets(updatedList);
      onPresetsUpdated(updatedList);
      setIsAdding(false);
      setEditingIndex(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (presets.length <= 1) {
      setError(t.manageModal.minLimitAlert);
      return;
    }

    const nextPresets = presets.filter((_, i) => i !== index);
    setIsSaving(true);
    setError(null);
    try {
      const saved = await api.savePresets(nextPresets);
      const updatedList: PresetMood[] = (saved as any)?.presets || saved;
      setPresets(updatedList);
      onPresetsUpdated(updatedList);
      if (editingIndex === index) {
        setEditingIndex(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete preset');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.resetPresets(language);
      const updatedList: PresetMood[] = (res as any)?.presets || res;
      setPresets(updatedList);
      onPresetsUpdated(updatedList);
      setIsAdding(false);
      setEditingIndex(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset presets');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#FAF7F2] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-cozy-lg border border-[#E8E2D9] max-h-[90vh] flex flex-col text-[#2D2825] relative">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#E8E2D9]/80">
          <div>
            <h2 className="text-xl font-bold text-[#2D2825] tracking-tight">{t.manageModal.title}</h2>
            <p className="text-xs text-[#8C827A] mt-0.5 text-pretty">{t.manageModal.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="p-1.5 rounded-full text-[#8C827A] hover:text-[#2D2825] hover:bg-black/5 active:scale-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-800 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Toolbar */}
        {!isAdding && editingIndex === null && (
          <div className="flex items-center justify-between pt-4 pb-2">
            <button
              type="button"
              onClick={handleStartAdd}
              disabled={presets.length >= 16 || isSaving}
              className="inline-flex items-center space-x-1.5 bg-gradient-to-b from-[#2D2825] to-[#1C1917] hover:from-black text-[#FAF7F2] px-3.5 py-2 rounded-xl text-xs font-semibold shadow-cozy-xs hover:shadow-cozy-sm active:scale-[0.96] transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-rose-400" />
              <span>{t.manageModal.addPreset}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={isSaving}
              className="inline-flex items-center space-x-1 text-xs text-[#8C827A] hover:text-[#2D2825] bg-white/70 hover:bg-white border border-[#E8E2D9] px-2.5 py-1.5 rounded-xl shadow-cozy-xs active:scale-[0.96] transition-all disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.manageModal.resetDefaults}</span>
            </button>
          </div>
        )}

        {/* Add / Edit Form */}
        {(isAdding || editingIndex !== null) && (
          <form
            onSubmit={handleSaveForm}
            className="my-4 p-4 bg-white/95 rounded-2xl border border-[#E8E2D9] shadow-cozy-xs space-y-3.5"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C827A]">
              {isAdding ? t.manageModal.addPreset : t.manageModal.editPreset}
            </h3>

            <div className="grid grid-cols-4 gap-3">
              {/* Emoji Input */}
              <div className="col-span-1">
                <label
                  htmlFor="preset-emoji-input"
                  className="block text-[11px] font-semibold text-[#8C827A] uppercase mb-1"
                >
                  {t.manageModal.emojiLabel}
                </label>
                <input
                  id="preset-emoji-input"
                  type="text"
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  maxLength={10}
                  className="w-full text-center text-xl bg-[#FAF7F2] border border-[#E8E2D9] rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400 shadow-inner"
                  required
                />
              </div>

              {/* Label Input */}
              <div className="col-span-3">
                <div className="flex justify-between items-center mb-1">
                  <label
                    htmlFor="preset-label-input"
                    className="block text-[11px] font-semibold text-[#8C827A] uppercase"
                  >
                    {t.manageModal.labelLabel}
                  </label>
                  <span className="text-[10px] font-mono tabular-nums text-[#8C827A]">
                    {formLabel.length}/30
                  </span>
                </div>
                <input
                  id="preset-label-input"
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  maxLength={30}
                  placeholder={t.manageModal.labelPlaceholder}
                  className="w-full text-sm bg-[#FAF7F2] border border-[#E8E2D9] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400 shadow-inner"
                  required
                />
              </div>
            </div>

            {/* Color Theme Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-[#8C827A] uppercase mb-1.5">
                {t.manageModal.themeLabel}
              </label>
              <div className="flex items-center space-x-2.5">
                {AVAILABLE_THEMES.map((theme) => {
                  const isSelected = formTheme === theme;
                  const themeStyle = getThemeStyles(theme);
                  return (
                    <button
                      key={theme}
                      type="button"
                      title={theme}
                      onClick={() => setFormTheme(theme)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-xs ${
                        themeStyle.accent
                      } ${isSelected ? 'ring-2 ring-offset-2 ring-[#2D2825] scale-110' : 'opacity-75 hover:opacity-100'}`}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#E8E2D9]/70">
              <button
                type="button"
                onClick={handleCancelForm}
                disabled={isSaving}
                className="px-3.5 py-1.5 text-xs text-[#8C827A] hover:text-[#2D2825] rounded-xl hover:bg-[#FAF7F2] transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-semibold bg-[#2D2825] hover:bg-black text-[#FAF7F2] rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {isSaving ? t.manageModal.saving : t.common.save}
              </button>
            </div>
          </form>
        )}

        {/* Presets List */}
        <div className="flex-1 overflow-y-auto mt-2 pr-1 space-y-2 max-h-[50vh]">
          {presets.map((preset, index) => {
            const theme = getThemeStyles(preset.colorTheme || preset.color_theme);
            const isLastPreset = presets.length <= 1;

            return (
              <div
                key={`${preset.emoji}-${preset.label}-${index}`}
                className="flex items-center justify-between p-3 rounded-2xl bg-white/80 border border-[#E8E2D9] hover:bg-white hover:border-[#D6CEC4] shadow-cozy-xs hover:shadow-cozy-sm transition-all"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-2xl select-none">{preset.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2D2825] truncate">{preset.label}</p>
                    <span
                      className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}
                    >
                      {preset.colorTheme || preset.color_theme || 'rose'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(index)}
                    disabled={isSaving}
                    aria-label={`${t.common.edit} ${preset.label}`}
                    title={t.common.edit}
                    className="p-2 rounded-xl text-[#8C827A] hover:text-[#2D2825] hover:bg-black/5 active:scale-[0.94] transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    disabled={isLastPreset || isSaving}
                    aria-label={`${t.common.delete} ${preset.label}`}
                    title={isLastPreset ? t.manageModal.minLimitAlert : t.common.delete}
                    className="p-2 rounded-xl text-[#8C827A] hover:text-rose-600 hover:bg-rose-50 active:scale-[0.94] transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8C827A]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-2 border-t border-[#E8E2D9]/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-white/80 hover:bg-white border border-[#E8E2D9] rounded-xl text-[#2D2825] shadow-cozy-xs hover:shadow-cozy-sm active:scale-[0.96] transition-all"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};

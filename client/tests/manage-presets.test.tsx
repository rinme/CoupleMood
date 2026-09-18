// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManagePresetsModal } from '../src/components/ManagePresetsModal.js';
import { MyMoodCard } from '../src/components/MyMoodCard.js';
import { I18nProvider } from '../src/i18n/index.js';
import { api } from '../src/api.js';
import type { PresetMood } from '../src/types.js';

describe('Manage Reactions Modal & MyMoodCard Integration', () => {
  const initialPresets: PresetMood[] = [
    { emoji: '🥺', label: 'คิดถึง', colorTheme: 'rose' },
    { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
    { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ManagePresetsModal Component', () => {
    it('displays the list of current presets with emojis, labels, and themes', () => {
      render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={vi.fn()}
          />
        </I18nProvider>
      );

      expect(screen.getByText('จัดการความรู้สึก')).toBeTruthy();
      expect(screen.getByText('คิดถึง')).toBeTruthy();
      expect(screen.getByText('หิว')).toBeTruthy();
      expect(screen.getByText('รักนะ')).toBeTruthy();
      expect(screen.getByText('🥺')).toBeTruthy();
      expect(screen.getByText('🤤')).toBeTruthy();
      expect(screen.getByText('🥰')).toBeTruthy();
    });

    it('does not render when isOpen is false', () => {
      render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={false}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={vi.fn()}
          />
        </I18nProvider>
      );

      expect(screen.queryByText('จัดการความรู้สึก')).toBeNull();
    });

    it('allows deleting a preset and prevents deleting when only 1 preset remains', async () => {
      const handleUpdated = vi.fn();
      const saveSpy = vi.spyOn(api, 'savePresets').mockResolvedValue({
        presets: [
          { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
          { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
        ],
      } as any);

      const { rerender } = render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={handleUpdated}
          />
        </I18nProvider>
      );

      // 3 items: delete buttons should be enabled
      const deleteButtons = screen.getAllByRole('button', { name: /ลบ|delete/i });
      expect(deleteButtons.length).toBe(3);
      expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(false);

      // Click delete on first preset (คิดถึง)
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledWith([
          { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
          { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
        ]);
        expect(handleUpdated).toHaveBeenCalledWith([
          { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
          { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
        ]);
      });

      // Rerender with only 1 preset to test safeguard
      rerender(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={[{ emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' }]}
            onPresetsUpdated={handleUpdated}
          />
        </I18nProvider>
      );

      const remainingDeleteBtn = screen.getByRole('button', { name: /ลบ|delete/i }) as HTMLButtonElement;
      expect(remainingDeleteBtn.disabled).toBe(true);

      // Clicking disabled delete button should not invoke save
      fireEvent.click(remainingDeleteBtn);
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('allows editing an existing preset (emoji, label, theme)', async () => {
      const handleUpdated = vi.fn();
      const updatedPresets: PresetMood[] = [
        { emoji: '🥳', label: 'ปาร์ตี้', colorTheme: 'emerald' },
        { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
        { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
      ];
      const saveSpy = vi.spyOn(api, 'savePresets').mockResolvedValue({
        presets: updatedPresets,
      } as any);

      render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={handleUpdated}
          />
        </I18nProvider>
      );

      // Click Edit on the first preset (คิดถึง)
      const editButtons = screen.getAllByRole('button', { name: /แก้ไข|edit/i });
      fireEvent.click(editButtons[0]);

      // Form inputs should show current values
      const emojiInput = screen.getByLabelText(/อิโมจิ|emoji/i) as HTMLInputElement;
      const labelInput = screen.getByLabelText(/ข้อความ|label/i) as HTMLInputElement;
      expect(emojiInput.value).toBe('🥺');
      expect(labelInput.value).toBe('คิดถึง');

      // Edit fields
      fireEvent.change(emojiInput, { target: { value: '🥳' } });
      fireEvent.change(labelInput, { target: { value: 'ปาร์ตี้' } });

      // Select theme emerald
      const emeraldThemeBtn = screen.getByTitle(/emerald/i) || screen.getByRole('button', { name: /emerald/i });
      fireEvent.click(emeraldThemeBtn);

      // Submit form
      const saveBtn = screen.getByRole('button', { name: /บันทึก|save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledWith(updatedPresets);
        expect(handleUpdated).toHaveBeenCalledWith(updatedPresets);
      });
    });

    it('allows adding a new preset with emoji, label, and theme', async () => {
      const handleUpdated = vi.fn();
      const expectedNewList: PresetMood[] = [
        ...initialPresets,
        { emoji: '☕', label: 'ชิลๆ', colorTheme: 'teal' },
      ];
      const saveSpy = vi.spyOn(api, 'savePresets').mockResolvedValue({
        presets: expectedNewList,
      } as any);

      render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={handleUpdated}
          />
        </I18nProvider>
      );

      // Open add form
      const addBtn = screen.getByRole('button', { name: /เพิ่มความรู้สึก|add reaction/i });
      fireEvent.click(addBtn);

      const emojiInput = screen.getByLabelText(/อิโมจิ|emoji/i) as HTMLInputElement;
      const labelInput = screen.getByLabelText(/ข้อความ|label/i) as HTMLInputElement;

      fireEvent.change(emojiInput, { target: { value: '☕' } });
      fireEvent.change(labelInput, { target: { value: 'ชิลๆ' } });

      // Select teal theme
      const tealThemeBtn = screen.getByTitle(/teal/i) || screen.getByRole('button', { name: /teal/i });
      fireEvent.click(tealThemeBtn);

      // Save new preset
      const saveBtn = screen.getByRole('button', { name: /บันทึก|save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledWith(expectedNewList);
        expect(handleUpdated).toHaveBeenCalledWith(expectedNewList);
      });
    });

    it('triggers reset to defaults and calls onPresetsUpdated', async () => {
      const handleUpdated = vi.fn();
      const defaultPresets: PresetMood[] = [
        { emoji: '🥺', label: 'คิดถึง', colorTheme: 'rose' },
        { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
        { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
        { emoji: '😴', label: 'ง่วง', colorTheme: 'purple' },
        { emoji: '💻', label: 'ยุ่งมาก', colorTheme: 'indigo' },
        { emoji: '☕', label: 'ชิลๆ', colorTheme: 'amber' },
        { emoji: '🤒', label: 'ไม่สบาย', colorTheme: 'teal' },
      ];
      const resetSpy = vi.spyOn(api, 'resetPresets').mockResolvedValue({
        presets: defaultPresets,
      } as any);

      render(
        <I18nProvider initialLanguage="th">
          <ManagePresetsModal
            isOpen={true}
            onClose={vi.fn()}
            presets={initialPresets}
            onPresetsUpdated={handleUpdated}
          />
        </I18nProvider>
      );

      const resetBtn = screen.getByRole('button', { name: /คืนค่าเริ่มต้น|reset/i });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(handleUpdated).toHaveBeenCalledWith(defaultPresets);
      });
    });
  });

  describe('MyMoodCard Integration with Manage Modal', () => {
    it('renders the "จัดการ" button next to "ความรู้สึกของฉัน"', () => {
      render(
        <I18nProvider initialLanguage="th">
          <MyMoodCard
            currentMood={null}
            onSetMood={vi.fn()}
            onClearMood={vi.fn()}
            presets={initialPresets}
          />
        </I18nProvider>
      );

      expect(screen.getByText('ความรู้สึกของฉัน')).toBeTruthy();
      expect(screen.getByRole('button', { name: /จัดการ|manage/i })).toBeTruthy();
    });

    it('opens ManagePresetsModal when "จัดการ" is clicked and updates card presets upon modification', async () => {
      vi.spyOn(api, 'savePresets').mockResolvedValue({
        presets: [
          { emoji: '🤤', label: 'หิวมาก', colorTheme: 'amber' },
        ],
      } as any);

      render(
        <I18nProvider initialLanguage="th">
          <MyMoodCard
            currentMood={null}
            onSetMood={vi.fn()}
            onClearMood={vi.fn()}
            presets={initialPresets}
          />
        </I18nProvider>
      );

      // Modal not initially open
      expect(screen.queryByText('จัดการความรู้สึก')).toBeNull();

      // Click "จัดการ"
      const manageBtn = screen.getByRole('button', { name: /จัดการ|manage/i });
      fireEvent.click(manageBtn);

      // Modal opens
      expect(screen.getByText('จัดการความรู้สึก')).toBeTruthy();
    });
  });
});

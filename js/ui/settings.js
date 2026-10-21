/* LocalWiki — ui/settings.js
   The "Wiki settings" dialog: the wiki's name, the app name shown in the top bar, the icon (a picture,
   a bundled icon or an emoji; also used as the browser-tab icon) and the color palette. Choices are
   previewed live; Save applies them as one undoable change (pages.updateSettings), Cancel restores.
   Settings are saved in the wiki folder (wiki.json, and branding/logo.png for a picture).

   Depends on: i18n.js, palettes.js, model.js, state.js, pages.js, ui/elements.js, ui/appearance.js, ui/picker.js
   Provides:   LocalWiki.ui.openSettings, installSettings */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {t, describeError} = LW.i18n;
  const LOGO_SIZE = 256, MAX_UPLOAD = 10 * 1024 * 1024;

  let draft = null; // {name, appearance, logo} being edited

  function openSettings() {
    LW.pages.commitTitle();
    draft = {name: state.wiki.name, appearance: {...state.wiki.appearance}, logo: state.logo};
    els.settingsWikiName.value = draft.name;
    els.settingsAppName.value = draft.appearance.appName;
    renderPalettes();
    preview();
    els.settingsDialog.showModal();
  }
  function preview() {
    ui.applyAppearance(draft.appearance, draft.logo);
    els.settingsIconPreview.classList.toggle('has-image', draft.appearance.icon === 'image' && !!draft.logo);
    els.settingsIconPreview.innerHTML = ui.brandIconHtml(draft.appearance, draft.logo);
    els.settingsIconReset.disabled = !draft.appearance.icon;
    for (const card of els.settingsPalettes.children) {
      const chosen = card.dataset.palette === LW.palettes.byId(draft.appearance.palette).id;
      card.classList.toggle('active', chosen);
      card.setAttribute('aria-pressed', String(chosen));
    }
  }
  // One card per palette with swatches of its main colors in the current theme.
  function renderPalettes() {
    const mode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    els.settingsPalettes.replaceChildren(...LW.palettes.list.map(palette => {
      const colors = palette[mode];
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'palette-card'; card.dataset.palette = palette.id;
      card.style.background = colors.panel; card.style.color = colors.text; card.style.borderColor = colors.border;
      const swatches = document.createElement('span'); swatches.className = 'palette-swatches';
      for (const token of ['bg', 'sidebar-bg', 'accent', 'accent-soft', 'text']) {
        const chip = document.createElement('span'); chip.className = 'palette-chip'; chip.style.background = colors[token];
        chip.title = token; swatches.append(chip);
      }
      const name = document.createElement('span'); name.className = 'palette-name'; name.textContent = t('palette.' + palette.id);
      const sample = document.createElement('span'); sample.className = 'palette-sample';
      sample.style.background = colors.accent; sample.style.color = colors['on-accent']; sample.textContent = t('set.sample_button');
      card.append(swatches, name, sample);
      card.addEventListener('click', () => { draft.appearance.palette = palette.id; preview(); });
      return card;
    }));
  }

  // A picture is scaled to fit 256 × 256 and stored as PNG, whatever format was chosen.
  async function useImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { ui.toast(t('set.err_not_image')); return; }
    if (file.size > MAX_UPLOAD) { ui.toast(t('set.err_too_large')); return; }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(LW.i18n.error('set.err_unreadable')); img.src = url;
      });
      const scale = Math.min(1, LOGO_SIZE / Math.max(image.naturalWidth || LOGO_SIZE, image.naturalHeight || LOGO_SIZE));
      const width = Math.max(1, Math.round((image.naturalWidth || LOGO_SIZE) * scale)), height = Math.max(1, Math.round((image.naturalHeight || LOGO_SIZE) * scale));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      draft.logo = canvas.toDataURL('image/png');
      draft.appearance.icon = 'image';
      preview();
    } catch (err) { ui.toast(t('set.err_image', {error: describeError(err)})); }
    finally { URL.revokeObjectURL(url); }
  }

  function save() {
    const chosen = draft;
    chosen.name = els.settingsWikiName.value;
    chosen.appearance.appName = els.settingsAppName.value.trim() || LW.model.DEFAULT_APP_NAME;
    draft = null;
    els.settingsDialog.close();
    LW.pages.updateSettings(chosen); // redraws everything when something changed
    ui.applyAppearance();
  }
  // Discards the choices and restores the wiki's current appearance.
  function cancel() { draft = null; els.settingsDialog.close(); ui.applyAppearance(); }

  function installSettings() {
    els.settingsButton.addEventListener('click', openSettings);
    els.settingsAppName.addEventListener('input', () => { draft.appearance.appName = els.settingsAppName.value.trim() || LW.model.DEFAULT_APP_NAME; preview(); });
    els.settingsIconChoose.addEventListener('click', () => ui.openPicker('custom', 'icons', glyph => { draft.appearance.icon = glyph; preview(); }));
    els.settingsIconUpload.addEventListener('click', () => els.settingsIconFile.click());
    els.settingsIconFile.addEventListener('change', async () => { await useImage(els.settingsIconFile.files?.[0]); els.settingsIconFile.value = ''; });
    els.settingsIconReset.addEventListener('click', () => { draft.appearance.icon = ''; preview(); });
    els.settingsSave.addEventListener('click', save);
    els.settingsCancel.addEventListener('click', cancel);
    els.settingsClose.addEventListener('click', cancel);
    // Esc counts as Cancel.
    els.settingsDialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  }

  Object.assign(ui, {openSettings, installSettings});
})();

/* LocalWiki — ui/text-style.js
   The toolbar's Text size and Text color buttons: a small menu under the button. Choosing an entry
   styles the selected words in whichever editor is in use (see visualStyle in ui/visual-editor.js
   and markdownStyle in ui/editor.js). Pages store it as :size[large]{words} and :color[red]{words}.

   Depends on: i18n.js, palettes.js, ui/elements.js, ui/page.js (activeSurface), ui/editor.js, ui/visual-editor.js
   Provides:   LocalWiki.ui.installTextStyle */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {t} = LW.i18n;

  // [value, text key]; "normal" and "default" take the style away again (the Visual editor only).
  const SIZES = [['small', 'size.small'], ['normal', 'size.normal'], ['large', 'size.large'], ['huge', 'size.huge']];
  const COLORS = [['red', 'color.red'], ['orange', 'color.orange'], ['yellow', 'color.yellow'], ['green', 'color.green'],
    ['blue', 'color.blue'], ['purple', 'color.purple'], ['pink', 'color.pink'], ['gray', 'color.gray']];
  let openFor = null; // 'size' | 'color' | null

  function close() { els.styleMenu.hidden = true; els.styleMenu.replaceChildren(); openFor = null; }
  function choose(group, value) {
    close();
    if (ui.activeSurface() === 'visual') ui.visualStyle(group, value === 'normal' || value === 'default' ? null : value);
    else if (value !== 'normal' && value !== 'default') ui.markdownStyle(group, value);
  }
  function item(group, value, text, className = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'style-item ' + className; b.setAttribute('role', 'menuitem');
    b.textContent = text; b.dataset.value = value;
    b.addEventListener('click', () => choose(group, value));
    return b;
  }
  function open(group, anchor) {
    if (openFor === group) { close(); return; }
    if (ui.activeSurface() === 'visual') ui.saveVisualSelection();
    const visual = ui.activeSurface() === 'visual';
    const entries = group === 'size' ? SIZES : COLORS;
    const buttons = entries.filter(([value]) => visual || (value !== 'normal')).map(([value, key]) => {
      const b = item(group, value, t(key), group === 'size' ? 'size-' + value : 'color-' + value);
      return b;
    });
    if (group === 'color' && visual) buttons.push(item('color', 'default', t('color.default'), 'color-default'));
    els.styleMenu.replaceChildren(...buttons);
    els.styleMenu.classList.toggle('is-colors', group === 'color');
    els.styleMenu.hidden = false; openFor = group;
    const frame = els.card.getBoundingClientRect(), box = anchor.getBoundingClientRect();
    els.styleMenu.style.top = '6px';
    els.styleMenu.style.left = Math.max(0, Math.min(box.left - frame.left, frame.width - els.styleMenu.offsetWidth)) + 'px';
  }

  function installTextStyle() {
    els.sizeButton.addEventListener('click', () => open('size', els.sizeButton));
    els.colorButton.addEventListener('click', () => open('color', els.colorButton));
    els.styleMenu.addEventListener('mousedown', event => event.preventDefault()); // keep the selection
    document.addEventListener('mousedown', event => {
      if (openFor && !els.styleMenu.contains(event.target) && !els.sizeButton.contains(event.target) && !els.colorButton.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && openFor) close(); });
  }
  Object.assign(ui, {installTextStyle});
})();

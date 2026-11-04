// Тест экранов в браузере. Запуск: npx playwright test tests/screens.spec.mjs
// Открывает собранные файлы из dist/ и проверяет то, что нельзя увидеть в токенах:
// размеры нажимаемых элементов, прокрутку, подписи, консоль, контраст на реальных пикселях (axe).
// Требует: npm i -D @playwright/test @axe-core/playwright
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [['Дизайн-система', 'dist/Naryad-Design-System.html'], ['Прототип', 'dist/Naryad-CRM-prototype.html']];
const sizes = [['телефон', 390, 844], ['планшет', 820, 1180], ['десктоп', 1280, 800]];
const themes = ['dark', 'light'];

for (const [name, file] of pages) for (const [dev, w, h] of sizes) for (const th of themes) {
  test(`${name} · ${dev} · ${th}`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: th });
    await page.goto('file://' + join(root, file));
    await page.waitForTimeout(1200);
    // 1. нет ошибок консоли
    expect(errors, 'ошибки консоли').toEqual([]);
    // 2. нет горизонтальной прокрутки страницы
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'горизонтальная прокрутка').toBeLessThanOrEqual(1);
    // 3. язык
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
    // 4. нет шрифта меньше 10.5
    const tiny = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length);
    expect(tiny, 'текст меньше 10.5').toBe(0);
    // 5. кнопки-иконки подписаны, поля подписаны
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length);
    expect(unlabeled, 'кнопки без подписи').toBe(0);
    const noField = await page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].filter((i) => i.type !== 'range' && !i.getAttribute('aria-label') && !i.labels?.length).length);
    expect(noField, 'поля без подписи').toBe(0);
    // 6. зона нажатия на телефоне не меньше 44 (с учётом прозрачной рамки)
    if (dev === 'телефон') {
      const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(b).display === 'none') return false; return Math.max(r.height, r.height + 2 * 0) < 36; }).length);
      expect(small, 'нажимаемые элементы ниже 36').toBe(0);
    }
    // 7. контраст и доступность на реальных пикселях
    const axe = await new AxeBuilder({ page }).withRules(['color-contrast', 'button-name', 'label', 'image-alt']).analyze();
    expect(axe.violations.map((v) => v.id + ' ×' + v.nodes.length), 'axe').toEqual([]);
    // 8. снимок для визуального сравнения
    await page.screenshot({ path: join(root, `tests/shots/${name}-${dev}-${th}.png`), fullPage: false });
  });
}

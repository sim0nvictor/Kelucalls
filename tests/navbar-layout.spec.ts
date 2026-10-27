import { expect, test } from "@playwright/test";

const viewportWidths = [320, 360, 390, 430, 768, 1024, 1180, 1280, 1440, 1920];
const zoomEquivalentWidths = [1.25, 1.5].flatMap((zoom) =>
  viewportWidths.map((width) => Math.max(320, Math.round(width / zoom)))
);
const widthsToCheck = [...new Set([...viewportWidths, ...zoomEquivalentWidths])].sort((a, b) => a - b);

test.use({ hasTouch: true });

test("navbar fits supported viewports and the mobile drawer responds to input", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}/trending`);
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(1);
  await expect(page.locator("#compact-search-overlay")).toHaveCount(1);

  for (const width of widthsToCheck) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(50);

    const layout = await page.evaluate(() => {
      const rect = (element: Element) => {
        const { x, y, right, bottom, width, height } = element.getBoundingClientRect();
        return { x, y, right, bottom, width, height };
      };
      const visible = (selector: string) => {
        const element = document.querySelector(selector);
        return element && getComputedStyle(element).display !== "none" && element.getBoundingClientRect().width > 0
          ? rect(element)
          : null;
      };
      const mobile = innerWidth < 768;
      const search = innerWidth < 1024
        ? visible('[data-testid="compact-search-toggle"]')
        : visible('[data-testid="desktop-search-slot"]');
      const nodes = mobile
        ? [
            visible('[data-testid="mobile-brand"]'),
            visible('[data-testid="mobile-wordmark"]'),
            visible('[data-testid="mobile-menu-toggle"]'),
          ]
        : [
            visible('[data-testid="desktop-brand"]'),
            search,
            ...[...document.querySelectorAll('[data-testid="desktop-nav-item"]')]
              .filter((element) => element.getBoundingClientRect().width > 0)
              .map(rect),
            visible('[data-testid="desktop-actions"]'),
          ];
      const boxes = nodes.filter((box): box is NonNullable<typeof box> => box !== null);
      const intersections: Array<[number, number]> = [];
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const a = boxes[left];
          const b = boxes[right];
          if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) {
            intersections.push([left, right]);
          }
        }
      }
      const labels = [...document.querySelectorAll('[data-testid="desktop-nav-item"] span')]
        .filter((element) => getComputedStyle(element).display !== "none").length;
      const menuButton = document.querySelector('[data-testid="mobile-menu-toggle"]');
      const menuButtonRect = menuButton?.getBoundingClientRect();

      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        intersections,
        labels,
        menuButtonSize: menuButtonRect ? [menuButtonRect.width, menuButtonRect.height] : null,
        navScroll: visible('[data-testid="desktop-nav"]')
          ? (() => {
              const nav = document.querySelector('[data-testid="desktop-nav"]')!;
              return [nav.scrollWidth, nav.clientWidth];
            })()
          : null,
      };
    });

    expect(layout.scrollWidth, `horizontal page overflow at ${width}px`).toBeLessThanOrEqual(layout.width);
    expect(layout.intersections, `overlapping navbar elements at ${width}px`).toEqual([]);

    if (width === 390) {
      expect(layout.menuButtonSize).toEqual([44, 44]);
      const toggle = page.locator('button[aria-controls="mobile-navigation-drawer"]');
      const bounds = await toggle.boundingBox();
      expect(bounds).not.toBeNull();
      await page.touchscreen.tap(
        (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
        (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2
      );
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#mobile-navigation-drawer")).toBeVisible();
      await expect(page.locator("#mobile-navigation-drawer input")).toBeVisible();
      await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
      if (width === 390) {
        await page.screenshot({
          path: testInfo.outputPath("navbar-mobile-drawer-390.png"),
          animations: "disabled",
        });
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("#mobile-navigation-drawer")).toBeHidden();
    } else if (width >= 768) {
      expect(layout.navScroll?.[0]).toBeLessThanOrEqual(layout.navScroll?.[1] ?? 0);
      expect(layout.labels > 0).toBe(width >= 1536);
    }

    if (viewportWidths.includes(width)) {
      await page.screenshot({
        path: testInfo.outputPath(`navbar-${width}.png`),
        animations: "disabled",
      });
    }
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(100);
  await page.locator('button[aria-controls="compact-search-overlay"]').click();
  await expect(page.locator("#compact-search-overlay")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(page.locator("#compact-search-overlay")).toBeHidden();
  expect(browserErrors).toEqual([]);
});

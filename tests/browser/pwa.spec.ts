import { expect, test } from '@playwright/test';

test('downloads character previews on selection and reuses them across offline visits', async ({
  page,
  context,
}) => {
  const path = '/models/ghost_character.glb';
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith(path)) requests.push(request.url());
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
    .toBe('activated');
  expect(requests).toHaveLength(0);
  const preview = page.getByTestId('weapon-showcase');
  async function chooseGhost() {
    await page.getByRole('button', { name: 'LOADOUTS', exact: true }).click();
    await page.getByLabel('Character', { exact: true }).selectOption('ghost');
    await expect(preview).toHaveAttribute('data-status', 'ready');
    await expect(preview).toHaveAccessibleName('Ghost showcase');
  }
  await chooseGhost();
  expect(requests).toHaveLength(1);
  await expect
    .poll(() =>
      page.evaluate(async (path) => {
        const cache = (await caches.keys()).find((name) =>
          name.endsWith(':models'),
        );
        return (
          !!cache &&
          (await (await caches.open(cache)).keys()).some(
            (request) => new URL(request.url).pathname === path,
          )
        );
      }, path),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  const response = page.waitForResponse((entry) => entry.url().endsWith(path));
  await chooseGhost();
  expect((await response).fromServiceWorker()).toBe(true);
});

test('offers desktop installation steps without a native prompt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
  });
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const install = menu.getByRole('button', { name: 'Install app' });
  await install.click();
  await expect(install).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByText(/Chrome or Edge browser menu/)).toBeVisible();
  await expect(menu.getByText('File → Add to Dock')).toBeVisible();
});

const androidPhone = {
  hasTouch: true,
  isMobile: true,
  screen: { width: 390, height: 844 },
  viewport: { width: 844, height: 390 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
};

test.describe('Android installation and offline Training', () => {
  test.use(androidPhone);

  test('offers a valid install and starts a fresh Training session offline', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({ preset: 'performance', adaptive: false }),
      ),
    );
    await page.goto('/');
    await expect
      .poll(() =>
        page.evaluate(() => navigator.serviceWorker.controller?.state),
      )
      .toBe('activated');
    const cdp = await context.newCDPSession(page);
    const { data, manifest } = await cdp.send('Page.getAppManifest');
    expect(manifest).toMatchObject({
      name: 'BREAKPOINT',
      scope: new URL('/', page.url()).href,
    });
    expect(JSON.parse(data!)).toMatchObject({
      display: 'standalone',
      orientation: 'landscape',
    });
    await expect
      .poll(async () => {
        const { installabilityErrors } = await cdp.send(
          'Page.getInstallabilityErrors',
        );
        // Playwright creates a private browser context for each test.
        return installabilityErrors.filter(
          ({ errorId }) => errorId !== 'in-incognito',
        );
      })
      .toEqual([]);

    await context.setOffline(true);
    // Report the OS signal on the new document as well as blocking network I/O.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
    });
    const response = await page.goto('/?offline-training');
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page).toHaveURL(/\?offline-training$/);
    await page
      .getByRole('button', { name: 'Create a room', exact: true })
      .tap();
    await page.getByLabel('PLAYER NAME').fill('Offline trainee');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).tap();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
      'Private rooms require an internet connection.',
    );
    await page.getByRole('button', { name: 'Close rooms' }).tap();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const hud = page.getByTestId('weapon-status');
    await expect(hud).toHaveAttribute('data-ammo', '30');
    await page.getByRole('button', { name: 'Hip Fire' }).tap();
    await expect(hud).toHaveAttribute('data-ammo', '29');
    await page
      .getByRole('button', { name: 'Switch weapon', exact: true })
      .tap();
    await expect(hud).toHaveAttribute('data-weapon', 'smg');
  });

  test('uses a browser install prompt and hides the button after installation', async ({
    page,
  }) => {
    await page.goto('/');
    const install = page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('button', { name: 'Install app' });
    await page.evaluate(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(offer, {
        prompt: async () => {
          document.documentElement.dataset.installPrompted = 'true';
          window.dispatchEvent(new Event('appinstalled'));
        },
      });
      window.dispatchEvent(offer);
      document.documentElement.dataset.installOfferCaptured = String(
        offer.defaultPrevented,
      );
    });
    await expect(page.locator('html')).toHaveAttribute(
      'data-install-offer-captured',
      'true',
    );
    await install.tap();
    await expect(page.locator('html')).toHaveAttribute(
      'data-install-prompted',
      'true',
    );
    await expect(install).toHaveCount(0);
  });
});

test.describe('iPhone installation guidance', () => {
  test.use({
    ...androidPhone,
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });

  test('shows the Safari Share instructions in portrait', async ({ page }) => {
    await page.addInitScript(() => {
      // Chromium still exposes its own install event under an iPhone UA.
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      });
    });
    await page.goto('/');
    const rotation = page.getByRole('dialog', { name: 'ROTATE YOUR DEVICE' });
    const install = rotation.getByRole('button', { name: 'Install app' });
    await install.tap();
    await expect(install).toHaveAttribute('aria-expanded', 'true');
    await expect(rotation.getByText('Add to Home Screen')).toBeVisible();
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icons/apple-touch-icon.png',
    );
  });
});

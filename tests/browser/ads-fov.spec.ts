import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
  });
}

async function enterTraining(page: Page) {
  await page.getByRole('button', { name: /^(ENTER|RESUME) TRAINING$/ }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
}

function readout(page: Page, name: string) {
  return async () =>
    Number(
      await page.getByTestId('weapon-status').getAttribute(`data-${name}`),
    );
}

async function turnInAds(page: Page): Promise<number> {
  const marker = page.getByTestId('minimap-player');
  const heading = () =>
    marker.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    });
  const before = await heading();
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 20 })),
  );
  await expect.poll(heading).not.toBe(before);
  return (await heading()) - before;
}

test('Sync ADS FOV applies in the current game, preserves turning, and survives reload', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/');
  const toggle = page.getByRole('combobox', { name: 'Sync ADS FOV' });
  const baseSlider = page.getByRole('slider', { name: 'Field of view' });
  const fov = readout(page, 'fov');
  for (const base of [110, 65]) {
    let traditionalTurn = 0;
    for (const mode of ['off', 'on'] as const) {
      await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
      if (base === 110 && mode === 'off') {
        await expect(toggle).toHaveValue('off');
        await expect(toggle).toHaveAccessibleDescription(
          'Synchronizes aiming field of view with your configured camera FOV.',
        );
      }
      await baseSlider.press(base === 110 ? 'End' : 'Home');
      await expect(baseSlider).toHaveValue(String(base));
      await toggle.selectOption(mode);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await enterTraining(page);
      await page.keyboard.press('1');
      await expect.poll(fov).toBeCloseTo(base, 1);
      await page.mouse.down({ button: 'right' });
      const target = mode === 'on' ? base - 0.35 * (base - 62) : 62;
      await expect.poll(fov).toBeCloseTo(target, 1);
      await expect.poll(readout(page, 'ads')).toBeGreaterThan(0.999);
      const turn = await turnInAds(page);
      if (mode === 'off') traditionalTurn = turn;
      else {
        expect(turn).toBeCloseTo(traditionalTurn, 4);
        await page.keyboard.press(base === 110 ? '2' : '4');
        const nextFov =
          base === 110
            ? base - 0.35 * (base - 67)
            : (Math.atan(Math.tan((base * Math.PI) / 360) / 2.8) * 360) /
              Math.PI;
        await expect.poll(fov).toBeCloseTo(nextFov, 1);
      }
      await page.mouse.up({ button: 'right' });
      await page.keyboard.press('Escape');
      await expect(page.locator('.crosshair')).toHaveCount(0);
    }
  }
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(toggle).toHaveValue('on');
  await expect(baseSlider).toHaveValue('65');
});

test('Sync ADS FOV widens both sniper scope styles while preserving optical peripheral vision', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/');
  const scope = page.getByTestId('sniper-scope');
  const fov = readout(page, 'fov');
  const sampleView = async () => {
    const screenshot = await page.locator('canvas').screenshot();
    return page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const context = new OffscreenCanvas(image.width, image.height).getContext(
        '2d',
      )!;
      context.drawImage(image, 0, 0);
      const sample = (columns: number[]) =>
        columns.flatMap((x) =>
          [0.35, 0.45, 0.55, 0.65].flatMap((y) =>
            Array.from(
              context.getImageData(
                Math.floor(image.width * x),
                Math.floor(image.height * y),
                1,
                1,
              ).data,
            ),
          ),
        );
      return {
        center: sample([0.34, 0.42, 0.58, 0.66]),
        edge: sample([0.1, 0.9]),
      };
    }, screenshot.toString('base64'));
  };
  for (const style of ['classic', 'optic']) {
    let traditional: Awaited<ReturnType<typeof sampleView>> | undefined;
    for (const mode of ['off', 'on']) {
      await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
      await page.getByRole('tab', { name: /CONTROLS/ }).click();
      await page.getByRole('slider', { name: 'Field of view' }).press('End');
      await page
        .getByRole('combobox', { name: 'Sync ADS FOV' })
        .selectOption(mode);
      await page.getByRole('tab', { name: /DISPLAY/ }).click();
      await page
        .getByLabel('Sniper scope style', { exact: true })
        .selectOption(style);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await enterTraining(page);
      await page.keyboard.press('4');
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-weapon',
        'sniper',
      );
      await expect.poll(fov).toBeCloseTo(110, 1);
      const hip = await sampleView();
      await page.mouse.down({ button: 'right' });
      const magnification = mode === 'on' ? 2.8 : 4;
      const target =
        (Math.atan(Math.tan((110 * Math.PI) / 360) / magnification) * 360) /
        Math.PI;
      await expect(scope).toHaveCSS('opacity', '1');
      await expect(scope).toContainText(`${magnification}×`);
      await expect.poll(fov).toBeCloseTo(target, 1);
      const aimed = await sampleView();
      if (style === 'optic') expect(aimed.edge).toEqual(hip.edge);
      if (traditional) {
        expect(aimed.center).not.toEqual(traditional.center);
        if (style === 'classic')
          expect(aimed.edge).not.toEqual(traditional.edge);
      }
      traditional = aimed;
      await page.mouse.up({ button: 'right' });
      await expect.poll(fov).toBeCloseTo(110, 1);
      await page.keyboard.press('Escape');
      await expect(page.locator('.crosshair')).toHaveCount(0);
    }
  }
});

test('synced ADS stays stable through a sprint, slide, jump, recoil and crouch', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({ fov: 103, syncAdsFov: true, reducedMotion: false }),
    );
  });
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto('/');
  await enterTraining(page);
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.clock.runFor(400);
  const pose = page.getByTestId('position');
  const fov = readout(page, 'fov');
  const target = 103 - 0.35 * (103 - 62);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.clock.runFor(288);
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(400);
  await expect(pose).toHaveAttribute('data-state', 'sprinting');
  expect(Math.abs((await fov()) - target)).toBeLessThan(1.5);
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(336);
  await page.keyboard.press('c');
  await page.clock.runFor(96);
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(400);
  await expect(pose).toHaveAttribute('data-state', 'sliding');
  expect(Math.abs((await fov()) - target)).toBeLessThan(2);
  await page.keyboard.press('Space');
  await page.clock.runFor(256);
  await expect(pose).toHaveAttribute('data-state', 'airborne');
  const beforeShot = await fov();
  await page.mouse.down({ button: 'left' });
  await page.clock.runFor(80);
  await page.mouse.up({ button: 'left' });
  expect(await readout(page, 'shots')()).toBeGreaterThan(0);
  expect(await fov()).toBeCloseTo(beforeShot, 0);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.clock.runFor(720);
  expect(await fov()).toBeCloseTo(103, 1);
  await page.keyboard.press('c');
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(512);
  await expect(pose).toHaveAttribute('data-state', 'crouching');
  expect(await fov()).toBeCloseTo(target, 0);
  await page.mouse.up({ button: 'right' });
});

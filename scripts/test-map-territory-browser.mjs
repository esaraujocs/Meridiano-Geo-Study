import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(process.env.SMOKE_URL ?? "http://127.0.0.1:5000/", { waitUntil: "networkidle0" });
  const mount = async (targetId, center, zoom) => {
    await page.evaluate(async (id) => {
      window.__territoryTestRoot?.unmount();
      window.__cartaMap = undefined;
      const React = (await import("/node_modules/.vite/deps/react.js")).default;
      const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
      const { Game } = await import("/src/components/map-game.tsx");
      const { loadLegacy } = await import("/src/domain/legacy-data.ts");
      const data = await loadLegacy();
      document.getElementById("root").style.display = "none";
      let container = document.getElementById("territory-test");
      if (!container) {
        container = document.createElement("div");
        container.id = "territory-test";
        document.body.append(container);
      }
      window.__territoryTestRoot = createRoot(container);
      window.__territoryTestRoot.render(React.createElement(Game, {
        data, features: [{ id }], region: "mundo", options: { pace: "training", roundTier: "all" },
        onBack: () => {}, onEnd: () => {},
      }));
    }, targetId);
    await page.waitForFunction(() => window.__cartaMap?.loaded());
    await page.evaluate((camera) => window.__cartaMap.jumpTo(camera), { center, zoom });
    await page.waitForFunction(() => window.__cartaMap?.loaded());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const click = async (coordinates, expectedId) => {
    const hit = await page.evaluate((ll) => {
      const map = window.__cartaMap;
      const point = map.project(ll);
      const rect = map.getContainer().getBoundingClientRect();
      const corrected = map.queryRenderedFeatures(point, { layers: ["land"] });
      return { x: rect.left + point.x, y: rect.top + point.y, ids: corrected.map((f) => f.properties.carta_id) };
    }, coordinates);
    assert.ok(hit.ids.includes(expectedId), `own polygon must exist at ${coordinates}: ${hit.ids}`);
    await page.mouse.click(hit.x, hit.y);
    await page.waitForSelector(".map-target-overlay.is-correct, .map-target-overlay.is-wrong");
  };
  // Away from the dot at high zoom: the actual island contour must answer independently.
  await mount("16", [-170.75641, -14.31353], 11);
  await click([-170.75641, -14.31353], "16");
  assert.ok(await page.$(".map-target-overlay.is-correct"), "American Samoa island answers ASM, not USA");
  await mount("162", [105.6441, -10.50476], 11);
  await click([105.6441, -10.50476], "162");
  assert.ok(await page.$(".map-target-overlay.is-correct"), "Christmas island answers CXR, not AUS");
  // The answer must not change with the current target.
  await mount("840", [-170.75641, -14.31353], 11);
  await click([-170.75641, -14.31353], "16");
  assert.ok(await page.$(".map-target-overlay.is-wrong"), "American Samoa must not become USA when USA is requested");
  await mount("36", [105.6441, -10.50476], 11);
  await click([105.6441, -10.50476], "162");
  assert.ok(await page.$(".map-target-overlay.is-wrong"), "Christmas must not become AUS when AUS is requested");
  await mount("162", [105.6441, -10.50476], 7);
  await click([105.6441, -10.50476], "162");
  assert.ok(await page.$(".map-target-overlay.is-correct"), "Christmas selection also works at island-wide zoom");
  // São Martinho: as duas metades são polígonos próprios nos tiles (Marigot ao norte, Philipsburg ao sul).
  await mount("663", [-63.07, 18.06], 12);
  await click([-63.085, 18.07], "663");
  assert.ok(await page.$(".map-target-overlay.is-correct"), "Marigot answers the French half");
  await mount("534", [-63.07, 18.06], 12);
  await click([-63.045, 18.025], "534");
  assert.ok(await page.$(".map-target-overlay.is-correct"), "Philipsburg answers the Dutch half");
  await mount("534", [-63.07, 18.06], 12);
  await click([-63.085, 18.07], "663");
  assert.ok(await page.$(".map-target-overlay.is-wrong"), "the French half is not the Dutch half");
  assert.deepEqual(errors, [], "no browser exceptions");
  console.log("map territory browser: ASM/CXR/São Martinho own polygons and target-independent answers pass");
} finally {
  await browser.close();
}
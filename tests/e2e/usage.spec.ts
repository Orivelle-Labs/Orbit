import { expect, test } from "@playwright/test";
import { bootstrap } from "../fixtures";
import { fixture, calls, pushState } from "./native-fixture";
import { usagePage } from "../usage-fixtures";
test("usage shows account-wide statistics, filters and cursors without inference access", async ({
  page,
}) => {
  const state = bootstrap();
  state.connections[0]!.node_id = null;
  state.connections[0]!.permission_state = "readonly";
  state.session.inference_credential_status = "permission_denied";
  await fixture(page, { state });
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto("/#/usage");
  await expect(
    page.getByRole("heading", { name: "用量", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".usage-stat")).toHaveCount(4);
  await expect(page.locator(".usage-table tbody tr")).toHaveCount(4);
  await expect(page.locator(".usage-stat-accent")).toContainText("USD");
  await page.screenshot({
    path: ".cache/usage-demo/usage-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "已确认消费", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "上一页", exact: true }),
  ).toBeEnabled();
  await page.locator("#usage-outcome").click();
  await page.getByRole("option", { name: "失败", exact: true }).click();
  await expect(page.locator(".usage-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await expect(page.locator(".usage-detail-grid")).toContainText("a1000000-");
  const dark = bootstrap("synthetic-account-a", 2);
  dark.settings.theme = "dark";
  await pushState(page, dark);
  await page.screenshot({
    path: ".cache/usage-demo/usage-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(800);
  expect(await calls(page, "create_image_task")).toBe(0);
});

test("usage refresh failures preserve statistics and recover on retry", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/#/usage");
  await expect(
    page.locator(".usage-stat").first().locator("strong"),
  ).not.toHaveText("—");
  const previous = (await page.locator(".usage-stat-grid").textContent()) ?? "";
  await page.evaluate(() => {
    const native = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const invoke = native.invoke;
    const failing = new Set(["read_usage_summary", "list_usage_records"]);
    native.invoke = async (command, args) => {
      if (failing.delete(command))
        throw { code: "synthetic_usage_unavailable" };
      return invoke(command, args);
    };
  });
  await page.getByRole("button", { name: "刷新用量", exact: true }).click();
  await expect(page.locator(".usage-error")).toHaveCount(2);
  await expect(page.locator(".usage-stat-grid")).toHaveText(previous);
  const summaryError = page.locator(".usage-error").first();
  await summaryError
    .getByRole("button", { name: "刷新数据", exact: true })
    .click();
  await expect(page.locator(".usage-error")).toHaveCount(0);
  await expect(page.locator(".usage-stat-grid")).toHaveText(previous);
});

test("usage pagination changes only records without rebuilding statistics", async ({
  page,
}) => {
  const records = usagePage();
  const samples = records.data;
  records.data = Array.from({ length: 28 }, (_, index) => ({
    ...samples[index % samples.length]!,
    id: `pagination-record-${index}`,
  }));
  await fixture(page, { usageRecords: records });
  await page.goto("/#/usage");
  const history = page.locator(".usage-history");
  await expect(history.locator("tbody tr")).toHaveCount(4);
  const statistics = page.locator(".usage-stat-grid");
  const trend = page.locator(".usage-trend");
  const statisticsText = (await statistics.textContent())!;
  const trendText = (await trend.textContent())!;
  const statisticsElement = (await statistics.elementHandle())!;
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => navigations.push(frame.url()));
  let recordReads = await calls(page, "list_usage_records");
  for (const direction of ["下一页", "上一页"]) {
    await history.getByRole("button", { name: direction, exact: true }).click();
    await expect(history.locator("tbody tr")).toHaveCount(
      direction === "下一页" ? 24 : 4,
    );
    await expect(history).toHaveAttribute("aria-busy", "false");
    expect(await calls(page, "list_usage_records")).toBe(++recordReads);
    expect(await calls(page, "read_usage_summary")).toBe(1);
    expect(await statisticsElement.evaluate((el) => el.isConnected)).toBe(true);
    await expect(statistics).toHaveText(statisticsText);
    await expect(trend).toHaveText(trendText);
    await expect(statistics).toHaveAttribute("aria-busy", "false");
    await expect(trend).toHaveAttribute("aria-busy", "false");
  }
  expect(navigations).toEqual([]);
});

test("usage details show both lifetime writes and preserve legacy aggregate records", async ({
  page,
}) => {
  const records = usagePage();
  records.data[0]!.usage.tokens.cache_write = { value: 7000, status: "known" };
  records.data[0]!.usage.tokens.cache_write_30m = {
    value: 3000,
    status: "known",
  };
  records.data[0]!.usage.tokens.cache_write_12h = {
    value: 4000,
    status: "known",
  };
  await fixture(page, { usageRecords: records });
  await page.goto("/#/usage");
  await page
    .getByRole("button", { name: "查看详情", exact: true })
    .first()
    .click();
  const detail = page.locator(".usage-detail-grid");
  await expect(detail).toContainText("30min 缓存写入");
  await expect(detail).toContainText("3,000");
  await expect(detail).toContainText("12h 缓存写入");
  await expect(detail).toContainText("4,000");
  await expect(detail).not.toContainText("未区分时长");
  await page
    .getByRole("button", { name: "查看详情", exact: true })
    .first()
    .click();
  await expect(page.locator(".usage-detail-grid")).toContainText("未区分时长");
});

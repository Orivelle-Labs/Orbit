import { expect, test, type Page } from "@playwright/test";
import type {
  ImageBillingMode,
  ImagePricingScenario,
} from "../../src/shared/contracts";
import { pricedImageModel, tariff } from "../image-pricing-fixtures";
import { calls, fixture, type FixtureControl } from "./native-fixture";

async function choose(page: Page, id: string, label: string) {
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function quality(page: Page, value = "高") {
  await page.getByRole("button", { name: "高级选项", exact: true }).click();
  await choose(page, "image-quality", value);
  await page.getByRole("button", { name: "高级选项", exact: true }).click();
}

const modes: ImageBillingMode[] = ["image_count", "image_tokens_v1"];
for (const standard of modes) {
  for (const advanced of modes) {
    test(`${standard}/${advanced} follows each scenario's actual account tariff`, async ({
      page,
    }) => {
      const model = pricedImageModel();
      for (const [index, mode, price] of [
        [0, standard, "0.17"],
        [1, advanced, "0.43"],
      ] as const) {
        model.image_pricing[index]!.image_billing_mode = mode;
        model.image_pricing[index]!.pricing = tariff(mode, price);
      }
      await fixture(page, { models: [model] });
      await page.goto("/#/images");
      await choose(page, "image-model", model.label);
      const summary = page.locator(".image-pricing-summary");
      await expect(summary).toContainText("标准");
      await expect(summary).toContainText(
        standard === "image_count" ? "$0.17" : "按 Token 计费",
      );
      await page.getByRole("button", { name: "查看价格", exact: true }).click();
      let current = page
        .getByRole("dialog")
        .locator(".image-pricing-profile.current");
      await expect(current).toContainText("标准调用");
      if (standard === "image_count")
        await expect(
          current.locator(".image-pricing-profile-price"),
        ).toContainText("$0.17");
      else
        await expect(
          current.locator(".image-pricing-token-rates dd"),
        ).toHaveText(Array(5).fill("$0.17 / 1M token"));
      await page.getByRole("button", { name: "知道了", exact: true }).click();
      await quality(page);
      await expect(summary).toContainText("高级");
      await expect(summary).toContainText(
        advanced === "image_count" ? "$0.43" : "按 Token 计费",
      );
      await expect(page.locator(".image-parameter-summary")).toHaveText("质量");
      await page.getByRole("button", { name: "查看价格", exact: true }).click();
      current = page
        .getByRole("dialog")
        .locator(".image-pricing-profile.current");
      await expect(current).toContainText("高级参数调用");
      if (advanced === "image_count")
        await expect(
          current.locator(".image-pricing-profile-price"),
        ).toContainText("$0.43");
      else
        await expect(
          current.locator(".image-pricing-token-rates dd"),
        ).toHaveText(Array(5).fill("$0.43 / 1M token"));
      expect(await calls(page, "create_image_task")).toBe(0);
    });
  }
}

test("transparent defaults keep the standard tariff and token details retain the group prices and units", async ({
  page,
}) => {
  const model = pricedImageModel();
  await fixture(page, { models: [model] });
  await page.goto("/#/images");
  await choose(page, "image-model", model.label);
  await page.getByRole("button", { name: "高级选项", exact: true }).click();
  await page.locator("#image-background").check();
  await expect(page.locator(".image-pricing-summary")).toContainText("标准");
  await expect(page.locator(".image-pricing-summary")).toContainText("$0.08");
  await choose(page, "image-quality", "高");
  await page.getByRole("button", { name: "高级选项", exact: true }).click();
  await page.getByRole("button", { name: "查看价格", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".image-pricing-token-rates dd")).toHaveText([
    "$1.20 / 1M token",
    "$0.30 / 1M token",
    "$2.40 / 1M token",
    "$0.60 / 1M token",
    "$9.60 / 1M token",
  ]);
  await expect(dialog.getByText("当前协议不适用", { exact: true })).toHaveCount(
    2,
  );
  await dialog.screenshot({
    path: ".cache/evidence/image-pricing-details.png",
  });
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看价格", exact: true }),
  ).toBeFocused();
  expect(await calls(page, "create_image_task")).toBe(0);
});

for (const scenario of ["standard", "advanced"] as ImagePricingScenario[]) {
  test(`missing ${scenario} pricing disables only that scenario and preserves explicit zero`, async ({
    page,
  }) => {
    const missing = pricedImageModel();
    const selected = scenario === "standard" ? 0 : 1;
    missing.image_pricing[selected] = {
      scenario,
      configured: false,
      image_billing_mode: null,
      pricing: null,
    };
    const free = pricedImageModel("free-image");
    for (const profile of free.image_pricing) {
      profile.image_billing_mode = "image_count";
      profile.pricing = tariff("image_count", "0.000000000000");
    }
    await fixture(page, { models: [missing, free] });
    await page.goto("/#/images");
    await choose(page, "image-model", missing.label);
    await page.locator("#image-prompt").fill("Synthetic missing price");
    const generate = page.getByRole("button", {
      name: "生成图片",
      exact: true,
    });
    if (scenario === "advanced") {
      await expect(generate).toBeEnabled();
      await quality(page);
    }
    await expect(page.locator(".image-pricing-summary")).toContainText(
      "价格未配置",
    );
    await expect(generate).toBeDisabled();
    if (scenario === "standard") {
      await quality(page);
      await expect(generate).toBeEnabled();
    }
    await choose(page, "image-model", free.label);
    await expect(page.locator(".image-pricing-summary")).toContainText("$0.00");
    await expect(generate).toBeEnabled();
    await quality(page);
    await expect(page.locator(".image-pricing-summary")).toContainText("$0.00");
    await expect(generate).toBeEnabled();
    expect(await calls(page, "create_image_task")).toBe(0);
  });
}

test("batch estimates preserve decimals and submission keeps the selected count without sending a client price", async ({
  page,
}) => {
  const model = pricedImageModel();
  model.image_pricing[1]!.image_billing_mode = "image_count";
  model.image_pricing[1]!.pricing = tariff("image_count", "0.123456789012");
  await fixture(page, { models: [model] });
  await page.goto("/#/images");
  await choose(page, "image-model", model.label);
  await page.locator("#image-prompt").fill("Synthetic precise batch");
  await page.getByRole("button", { name: "高级选项", exact: true }).click();
  await page.locator("#image-n").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".image-pricing-summary")).toContainText(
    "$0.370370367036",
  );
  await page.getByRole("button", { name: "生成图片", exact: true }).click();
  const request = await page.evaluate(
    () =>
      (window as unknown as { __ORBIT_TEST__: FixtureControl }).__ORBIT_TEST__
        .lastRequests.create_image_task,
  );
  expect(request?.parameters).toMatchObject({ n: 3 });
  expect(request).not.toHaveProperty("pricing");
  expect(request).not.toHaveProperty("price");
  expect(await calls(page, "create_image_task")).toBe(1);
  await expect
    .poll(() => page.locator(".main-shell").evaluate((el) => el.scrollTop))
    .toBe(0);
});

test("legacy catalogs never imply an advanced price and model changes use their own currency", async ({
  page,
}) => {
  const legacy = {
    ...pricedImageModel("legacy-image"),
    image_pricing: null,
    image_billing_mode: "image_count" as const,
    sales_price: tariff("image_count", "0.07"),
  };
  const euro = pricedImageModel("euro-image");
  euro.image_pricing[0]!.pricing = tariff("image_count", "0.99", "EUR");
  euro.image_pricing[1]!.pricing = tariff("image_tokens_v1", "1.25", "EUR");
  await fixture(page, { models: [legacy, euro] });
  await page.goto("/#/images");
  await choose(page, "image-model", legacy.label);
  await expect(page.locator(".image-pricing-summary")).toContainText("$0.07");
  await quality(page);
  await expect(page.locator(".image-pricing-summary")).toContainText(
    "价格信息暂不可用",
  );
  await choose(page, "image-model", euro.label);
  await expect(page.locator(".image-pricing-summary")).toContainText(
    "EUR 0.99",
  );
  await page.getByRole("button", { name: "查看价格", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".image-pricing-token-rates dd"),
  ).toHaveText(Array(5).fill("EUR 1.25 / 1M token"));
});

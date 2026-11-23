import { expect, test } from "@playwright/test";
import type { HistoryImage } from "../../src/shared/contracts";
import { bootstrap, task } from "../fixtures";
import {
  calls,
  fixture,
  pushState,
  type FixtureControl,
} from "./native-fixture";

function historyImage(): HistoryImage {
  const saved = task();
  return {
    id: "details-image",
    title: "海报草稿",
    task_id: saved.id,
    account_id: saved.account_id,
    created_at: "2026-11-23T06:32:00Z",
    requested_model: saved.requested_model,
    observed_model: null,
    mime: "image/png",
    width: 1536,
    height: 1024,
    bytes: 1992294,
    preview_url: "http://asset.localhost/details-image",
  };
}

test("history details distinguish saved requests from files and keep rename, zoom, export and references working", async ({
  page,
}) => {
  const state = bootstrap();
  const saved = {
    ...task(),
    requested_model_label: "已保存的图片模型",
    prompt: "海报草稿\n保留完整提示词 <script>plain text</script>",
    parameters: {
      n: 2,
      quality: "high" as const,
      size: "auto",
      background: "transparent" as const,
      stream: false,
    },
    image_ids: ["details-image"],
  };
  state.tasks = [saved];
  state.image_history = [historyImage()];
  await fixture(page, { state });
  await page.route("http://asset.localhost/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#e3eee6"/><circle cx="768" cy="512" r="220" fill="#326b58"/></svg>',
    }),
  );
  await page.goto("/#/images");
  await page.getByRole("tab", { name: "本地历史" }).click();
  const entry = page.locator(".history-details-button");
  await entry.click();
  const details = page.getByRole("dialog", { name: "图片详情", exact: true });
  await expect(details.locator(".image-details-prompt")).toHaveText(
    saved.prompt,
  );
  await expect(details).toContainText("已保存的图片模型");
  await expect(
    details.locator(".image-details-facts").last().locator("dd"),
  ).toHaveText([
    "已保存的图片模型",
    "生成图片",
    "自动",
    "高",
    "透明",
    "2 张",
    "关闭",
  ]);
  await expect(details.locator(".image-details-file")).toContainText(
    "1536 × 1024",
  );
  await expect(details.locator(".image-details-file")).toContainText("1.9 MiB");
  await expect(details.locator(".image-details-request")).toContainText(
    saved.request_id!,
  );
  await details.getByRole("button", { name: "保存", exact: true }).click();
  await details.getByRole("button", { name: "复制图片", exact: true }).click();
  expect(await calls(page, "save_image_as")).toBe(1);
  expect(await calls(page, "copy_image")).toBe(1);
  expect(
    await page.evaluate(() => {
      const control = (window as unknown as { __ORBIT_TEST__: FixtureControl })
        .__ORBIT_TEST__;
      return [
        control.lastRequests.save_image_as,
        control.lastRequests.copy_image,
      ];
    }),
  ).toEqual([{ image_id: "details-image" }, { image_id: "details-image" }]);
  await details.getByRole("button", { name: "修改标题", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "修改标题", exact: true });
  await rename.locator("input").fill("最终海报 · " + "长标题".repeat(28));
  await rename.getByRole("button", { name: "保存更改", exact: true }).click();
  await expect(rename).toHaveCount(0);
  await expect(details.locator(".image-details-title")).toContainText(
    "最终海报",
  );
  await details
    .getByRole("button", { name: "放大预览", exact: true })
    .last()
    .click();
  const zoom = page.getByRole("dialog", { name: "放大预览", exact: true });
  await expect(zoom.locator("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);
  await expect(details).toBeVisible();
  for (const width of [1280, 800, 460]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await details.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          node.scrollWidth <= node.clientWidth + 1 &&
          rect.left >= 0 &&
          rect.right <= innerWidth
        );
      }),
    ).toBe(true);
    if (width === 1280)
      await details.screenshot({
        path: ".cache/evidence/image-history-details-wide.png",
      });
  }
  await details.screenshot({
    path: ".cache/evidence/image-history-details-narrow.png",
  });
  await details.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(entry).toBeFocused();
  await page.locator(".history-card .image-preview-button").click();
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "作为参考", exact: true }).click();
  await expect(details).toHaveCount(0);
  await expect(page.locator(".input-images")).toContainText(
    "details-image.png",
  );
  expect(await calls(page, "create_image_task")).toBe(0);
});

test("legacy history with missing metadata remains readable without borrowing another account's task", async ({
  page,
}) => {
  const state = bootstrap();
  state.tasks = [
    { ...task(), prompt: "", request_id: null, parameters: {} },
    {
      ...task(),
      account_id: "another-account",
      prompt: "PRIVATE_FOREIGN_PROMPT",
      request_id: "PRIVATE_FOREIGN_REQUEST",
    },
  ];
  state.image_history = [{ ...historyImage(), preview_url: null }];
  await fixture(page, { state });
  await page.goto("/#/images");
  await page.getByRole("tab", { name: "本地历史" }).click();
  await page.locator(".history-card .image-preview-button").click();
  const details = page.getByRole("dialog", { name: "图片详情", exact: true });
  await expect(details.locator(".image-details-prompt")).toHaveText("未记录");
  await expect(details.locator(".image-details-request")).toContainText(
    "未记录",
  );
  await expect(details.locator(".image-details-file")).toContainText(
    "1536 × 1024",
  );
  await expect(details).not.toContainText("PRIVATE_FOREIGN");
  await expect(
    details.getByRole("button", { name: "放大预览", exact: true }).last(),
  ).toBeDisabled();
  expect(await calls(page, "create_image_task")).toBe(0);
});

test("account changes close both the history details and an open title editor", async ({
  page,
}) => {
  const state = bootstrap();
  state.tasks = [task()];
  state.image_history = [historyImage()];
  await fixture(page, { state });
  await page.goto("/#/images");
  await page.getByRole("tab", { name: "本地历史" }).click();
  await page.locator(".history-details-button").click();
  await page
    .getByRole("dialog", { name: "图片详情", exact: true })
    .getByRole("button", { name: "修改标题", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "修改标题", exact: true }),
  ).toBeVisible();
  await pushState(page, bootstrap("another-account", 20));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".history-card")).toHaveCount(0);
  expect(await calls(page, "rename_history_image")).toBe(0);
});

test("removed history closes its details and zoom instead of displaying a stale image", async ({
  page,
}) => {
  const state = bootstrap();
  state.tasks = [task()];
  state.image_history = [historyImage()];
  await fixture(page, { state });
  await page.goto("/#/images");
  await page.getByRole("tab", { name: "本地历史" }).click();
  await page.locator(".history-details-button").click();
  await expect(
    page.getByRole("dialog", { name: "图片详情", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "图片详情", exact: true })
    .getByRole("button", { name: "放大预览", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("dialog", { name: "放大预览", exact: true }),
  ).toBeVisible();
  state.image_history = [];
  state.state_revision++;
  await pushState(page, state);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

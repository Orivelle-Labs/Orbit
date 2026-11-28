import { expect, test } from "@playwright/test";
import { bootstrap } from "../fixtures";
import { calls, fixture, pushState } from "./native-fixture";

test("native lifecycle events update both clients and home without manual refresh", async ({
  page,
}) => {
  const state = bootstrap();
  for (const client of state.clients)
    client.activation_state = "waiting_restart";
  await fixture(page, { state });
  await page.goto("/#/access");
  for (const kind of ["codex", "claude"] as const) {
    await expect(
      page.locator(`#client-${kind}`).getByText("待重启", { exact: true }),
    ).toBeVisible();
  }
  for (const [activation, label] of [
    ["waiting_start", "待启动"],
    ["unverified", "运行状态待确认"],
    ["connected", "已连接"],
  ] as const) {
    for (const client of state.clients) client.activation_state = activation;
    state.state_revision++;
    await pushState(page, state);
    for (const kind of ["codex", "claude"] as const) {
      await expect(
        page.locator(`#client-${kind}`).getByText(label, { exact: true }),
      ).toBeVisible();
    }
  }
  expect(await calls(page, "bootstrap")).toBe(1);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "首页", exact: true })
    .click();
  await expect(page.getByText("已连接", { exact: true })).toHaveCount(2);
  await expect(page.getByText("待重启", { exact: true })).toHaveCount(0);
  await expect(page.getByText("连接未验证", { exact: true })).toHaveCount(0);
  await expect(page.getByText("连接验证通过", { exact: true })).toHaveCount(0);
  await expect(page.getByText("客户端载入已确认", { exact: true })).toHaveCount(
    0,
  );
  state.clients[0]!.configuration_state = "conflict";
  state.clients[1]!.activation_state = "unavailable";
  state.state_revision++;
  await pushState(page, state);
  await expect(page.getByText("配置冲突", { exact: true })).toBeVisible();
  await expect(page.getByText("接入暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByText("已连接", { exact: true })).toHaveCount(0);
});

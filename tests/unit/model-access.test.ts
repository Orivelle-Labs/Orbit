import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
const bridge = vi.hoisted(() => ({
  call: vi.fn(),
  nativeAvailable: () => true,
}));
vi.mock("../../src/shared/bridge", async (original) => ({
  ...(await original<typeof import("../../src/shared/bridge")>()),
  ...bridge,
}));
import AccessPage from "../../src/pages/AccessPage.vue";
import { useOrbitStore } from "../../src/stores/orbit";
import { CAPABILITIES, type ModelView } from "../../src/shared/contracts";
import {
  bootstrap,
  imageModel,
  orbitSelectStub,
  syntheticCodexModel,
} from "../fixtures";

let models: ModelView[];
let wrapper: VueWrapper | undefined;
beforeEach(async () => {
  setActivePinia(createPinia());
  const state = bootstrap();
  models = [];
  bridge.call.mockReset().mockImplementation(async (command) => {
    if (command === "list_models") return models;
    if (command === "bootstrap") return state;
    throw new Error(`Unexpected synthetic IPC: ${command}`);
  });
  useOrbitStore().acceptState(state);
  await flushPromises();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
async function showAccess() {
  await useOrbitStore().loadModels();
  wrapper = mount(AccessPage, {
    global: { stubs: { ClientRow: true, OrbitSelect: orbitSelectStub } },
  });
  await flushPromises();
  return wrapper;
}

it("retains the account catalog across providers and exposes only compatible Claude mappings", async () => {
  const deepseek = {
    ...syntheticCodexModel("deepseek-text"),
    provider_id: "deepseek",
  };
  const anthropic = {
    ...syntheticCodexModel("claude-text"),
    provider_id: "anthropic",
    capabilities: [CAPABILITIES.messages],
  };
  const chat = {
    ...deepseek,
    id: "chat-only",
    capabilities: ["openai.chat_completions"],
  };
  const image = {
    ...imageModel("other-image"),
    provider_id: "other-image-provider",
  };
  const unsupported = {
    ...deepseek,
    id: "unsupported",
    support_status: "unsupported" as const,
  };
  models = [deepseek, anthropic, chat, image, unsupported];
  const page = await showAccess();
  expect(useOrbitStore().models.map((model) => model.id)).toEqual(
    models.map((model) => model.id),
  );
  expect(useOrbitStore().imageModels.map((model) => model.id)).toEqual([
    image.id,
  ]);
  const options = page
    .get("#claude-sonnet")
    .findAll("option")
    .map((option) => option.attributes("value"));
  expect(options).toContain(deepseek.id);
  expect(options).toContain(anthropic.id);
  for (const excluded of [chat.id, image.id, unsupported.id])
    expect(options).not.toContain(excluded);
  await page.get("#claude-sonnet").setValue(deepseek.id);
  await page.get("#claude-opus").setValue(anthropic.id);
  await page.get("#claude-haiku").setValue(deepseek.id);
  expect(
    page.get<HTMLButtonElement>("#client-claude .button.primary").element
      .disabled,
  ).toBe(false);
  expect(
    page.get<HTMLButtonElement>("#client-codex .button.primary").element
      .disabled,
  ).toBe(false);
});

it("disables Codex access after the account loses its only compatible Responses model", async () => {
  const allowed = {
    ...syntheticCodexModel("authorized-deepseek"),
    provider_id: "deepseek",
  };
  models = [allowed];
  const page = await showAccess();
  const button = page.get<HTMLButtonElement>("#client-codex .button.primary");
  expect(button.element.disabled).toBe(false);
  models = [
    {
      ...allowed,
      id: "messages-only",
      provider_id: "anthropic",
      capabilities: [CAPABILITIES.messages],
    },
  ];
  await useOrbitStore().loadModels();
  await flushPromises();
  expect(useOrbitStore().models.map((model) => model.id)).toEqual([
    "messages-only",
  ]);
  expect(button.element.disabled).toBe(true);
});

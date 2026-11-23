import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
const bridge = vi.hoisted(() => ({
  call: vi.fn(),
  nativeAvailable: () => true,
}));
vi.mock("../../src/shared/bridge", async (original) => ({
  ...(await original<typeof import("../../src/shared/bridge")>()),
  ...bridge,
}));
import ApiKeysPage from "../../src/pages/ApiKeysPage.vue";
import { useApiKeysStore } from "../../src/stores/api-keys";
import { useOrbitStore } from "../../src/stores/orbit";
import { bootstrap, orbitSelectStub } from "../fixtures";
import { apiKeyPage } from "../api-key-fixtures";
import { locale } from "../../src/shared/i18n";
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  locale.value = "zh-CN";
  setActivePinia(createPinia());
  const state = bootstrap();
  bridge.call.mockReset().mockImplementation((command) => {
    if (command === "bootstrap") return state;
    if (command === "list_api_keys") return apiKeyPage();
    if (command === "get_api_key") return apiKeyPage().items[0];
    if (command === "reveal_api_key")
      return {
        api_key_id: "A".repeat(26),
        plain_text_token: "orv_sk_UNIT_TEST_SECRET",
      };
    if (command === "copy_api_key") return undefined;
    return [];
  });
  useOrbitStore().acceptState(state);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});
async function show() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/api-keys");
  wrapper = mount(ApiKeysPage, {
    global: {
      plugins: [router],
      stubs: {
        OrbitSelect: orbitSelectStub,
        OrbitDialog: {
          props: ["open", "title"],
          template:
            '<section v-if="open" role="dialog"><h2>{{title}}</h2><slot /></section>',
        },
      },
    },
  });
  await flushPromises();
}
function button(label: string) {
  return wrapper!.findAll("button").find((button) => button.text() === label)!;
}
describe("API Key account and secret boundaries", () => {
  it("commits a selection from its returned state without waiting for a slow metadata list or another bootstrap", async () => {
    const api = useApiKeysStore();
    await api.load();
    const chosen = apiKeyPage().items[1]!;
    api.page!.bindings[0]!.api_key_id = chosen.id;
    api.page!.bindings[0]!.key_revision = "a".repeat(64);
    api.page!.bindings[1]!.api_key_id = chosen.id;
    api.page!.bindings[1]!.key_revision = chosen.key_revision;
    const result = bootstrap("synthetic-account-a", 2);
    result.connections[0]!.credential_revision = chosen.key_revision;
    result.connections[0]!.revision++;
    const releaseList: ((value: ReturnType<typeof apiKeyPage>) => void)[] = [];
    bridge.call.mockClear().mockImplementation((command) => {
      if (command === "select_api_key") return result;
      if (command === "list_api_keys")
        return new Promise((resolve) => {
          releaseList.push(resolve);
        });
      return [];
    });
    expect(await api.choose(chosen)).toBe(true);
    await flushPromises();
    expect(api.busy).toBe(false);
    expect(api.page?.selected?.id).toBe(chosen.id);
    expect(api.page?.bindings.map((binding) => binding.current)).toEqual([
      false,
      true,
    ]);
    expect(useOrbitStore().activeConnection?.credential_revision).toBe(
      chosen.key_revision,
    );
    expect(
      bridge.call.mock.calls.filter(([command]) => command === "bootstrap"),
    ).toHaveLength(0);
    expect(releaseList).toHaveLength(1);
    for (const release of releaseList)
      release({ ...apiKeyPage(), selected: chosen });
    await flushPromises();
  });
  it("does not apply a late key-selection result after the account changes", async () => {
    const api = useApiKeysStore();
    await api.load();
    let release!: (value: ReturnType<typeof bootstrap>) => void;
    bridge.call.mockImplementation((command) =>
      command === "select_api_key"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : command === "list_api_keys"
          ? apiKeyPage()
          : [],
    );
    const choosing = api.choose(apiKeyPage().items[1]!);
    useOrbitStore().acceptState(bootstrap("other-actor", 3));
    release(bootstrap("synthetic-account-a", 2));
    expect(await choosing).toBe(false);
    expect(api.page).toBeNull();
    expect(useOrbitStore().account?.id).toBe("other-actor");
  });
  it("drops a list response after the active account changes", async () => {
    let release!: (value: ReturnType<typeof apiKeyPage>) => void;
    bridge.call.mockImplementation((command) =>
      command === "list_api_keys"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : [],
    );
    const api = useApiKeysStore();
    const loading = api.load();
    useOrbitStore().acceptState(bootstrap("other-actor", 2));
    release(apiKeyPage());
    await loading;
    expect(api.page).toBeNull();
  });
  it("keeps revealed text out of stores and Pinia action results and clears it on blur", async () => {
    await show();
    const results: unknown[] = [];
    useApiKeysStore().$onAction(({ after }) =>
      after((value) => results.push(value)),
    );
    await button("详情").trigger("click");
    await flushPromises();
    await button("查看与复制").trigger("click");
    await button("显示密钥").trigger("click");
    await flushPromises();
    expect(wrapper!.text()).toContain("orv_sk_UNIT_TEST_SECRET");
    expect(JSON.stringify(useApiKeysStore().$state)).not.toContain(
      "orv_sk_UNIT_TEST_SECRET",
    );
    expect(JSON.stringify(results)).not.toContain("orv_sk_UNIT_TEST_SECRET");
    window.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(wrapper!.text()).not.toContain("orv_sk_UNIT_TEST_SECRET");
    await button("复制密钥").trigger("click");
    await flushPromises();
    expect(bridge.call).toHaveBeenCalledWith(
      "copy_api_key",
      expect.objectContaining({ api_key_id: "A".repeat(26) }),
    );
    expect(wrapper!.text()).not.toContain("orv_sk_UNIT_TEST_SECRET");
  });
  it("discards a late reveal after the account changes and closes all key dialogs", async () => {
    await show();
    let release!: (value: {
      api_key_id: string;
      plain_text_token: string;
    }) => void;
    bridge.call.mockImplementation((command) =>
      command === "get_api_key"
        ? apiKeyPage().items[0]
        : command === "reveal_api_key"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : command === "list_api_keys"
            ? apiKeyPage()
            : [],
    );
    await button("详情").trigger("click");
    await flushPromises();
    await button("查看与复制").trigger("click");
    await button("显示密钥").trigger("click");
    useOrbitStore().acceptState(bootstrap("other-actor", 3));
    release({
      api_key_id: "A".repeat(26),
      plain_text_token: "orv_sk_LATE_SECRET",
    });
    await flushPromises();
    expect(wrapper!.text()).not.toContain("orv_sk_LATE_SECRET");
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
  });
});

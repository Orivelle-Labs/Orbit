import { expect, it } from "vitest";
import { clientStatus } from "../../src/shared/format";
import { bootstrap, client } from "../fixtures";

it("overrides an old connected hint when configuration or detection is missing", () => {
  const target = { ...client(), activation_state: "connected" as const };
  const connection = bootstrap().connections[0]!;
  expect(
    clientStatus(
      { ...target, configuration_state: "not_configured" },
      connection,
      true,
    ).text,
  ).toBe("尚未配置");
  expect(
    clientStatus({ ...target, installed: false }, connection, true).text,
  ).toBe("未检测到应用");
  expect(clientStatus(target, connection, false).text).toBe("待检测");
});

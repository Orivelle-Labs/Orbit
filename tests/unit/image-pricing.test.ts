import { describe, expect, it } from "vitest";
import {
  formatImagePrice,
  imageCountEstimate,
  imagePriceProfiles,
} from "../../src/shared/image-pricing";
import type { ImageBillingMode } from "../../src/shared/contracts";
import { pricedImageModel, tariff } from "../image-pricing-fixtures";
import { publicFailure } from "../../src/shared/bridge";

describe("Panel image sales prices", () => {
  it("preserves each scenario's own mode and account prices in all four combinations", () => {
    for (const standard of [
      "image_count",
      "image_tokens_v1",
    ] as ImageBillingMode[]) {
      for (const advanced of [
        "image_count",
        "image_tokens_v1",
      ] as ImageBillingMode[]) {
        const model = pricedImageModel();
        model.image_pricing[0]!.image_billing_mode = standard;
        model.image_pricing[0]!.pricing = tariff(standard, "0.123456789012");
        model.image_pricing[1]!.image_billing_mode = advanced;
        model.image_pricing[1]!.pricing = tariff(advanced, "0.876543210987");
        const profiles = imagePriceProfiles(model);
        expect(profiles.map((profile) => profile.image_billing_mode)).toEqual([
          standard,
          advanced,
        ]);
        expect(
          profiles.map((profile) => profile.pricing?.rates[0]?.unit_price),
        ).toEqual(["0.123456789012", "0.876543210987"]);
        expect(
          profiles.every((profile) => profile.status === "configured"),
        ).toBe(true);
      }
    }
  });
  it("does not invent a price for a missing scenario or confuse explicit zero with missing data", () => {
    const model = pricedImageModel();
    model.image_pricing[0] = {
      scenario: "standard",
      configured: false,
      image_billing_mode: null,
      pricing: null,
    };
    let profiles = imagePriceProfiles(model);
    expect(profiles[0]!.status).toBe("unconfigured");
    expect(imageCountEstimate(profiles[0], 1)).toBeNull();
    expect(profiles[1]!.pricing?.rates[0]?.unit_price).toBe("1.200000000000");
    model.image_pricing[1]!.image_billing_mode = "image_count";
    model.image_pricing[1]!.pricing = tariff("image_count", "0.000000000000");
    profiles = imagePriceProfiles(model);
    expect(profiles[1]!.status).toBe("configured");
    expect(formatImagePrice(imageCountEstimate(profiles[1], 3), "USD")).toBe(
      "$0.00",
    );
  });
  it("keeps exact decimal estimates and never estimates token charges from image counts", () => {
    const model = pricedImageModel();
    model.image_pricing[0]!.pricing = tariff(
      "image_count",
      "999999999999.123456789012",
    );
    let profile = imagePriceProfiles(model)[0]!;
    expect(formatImagePrice(imageCountEstimate(profile, 3), "USD")).toBe(
      "$2,999,999,999,997.370370367036",
    );
    model.image_pricing[0]!.pricing = tariff(
      "image_count",
      "0.000000000001",
      "EUR",
    );
    profile = imagePriceProfiles(model)[0]!;
    expect(formatImagePrice(imageCountEstimate(profile, 3), "EUR")).toBe(
      "EUR 0.000000000003",
    );
    expect(imageCountEstimate(imagePriceProfiles(model)[1], 3)).toBeNull();
  });
  it("keeps invalid and incomplete tariffs unavailable", () => {
    for (const kind of [
      "missing",
      "duplicate",
      "unit",
      "negative",
      "decimal",
      "unknown-mode",
    ]) {
      const model = pricedImageModel();
      const advanced = model.image_pricing[1]!;
      const rates = advanced.pricing!.rates;
      if (kind === "missing") rates.pop();
      if (kind === "duplicate") rates[1] = { ...rates[0]! };
      if (kind === "unit") rates[0]!.unit_size = 1000;
      if (kind === "negative") rates[0]!.unit_price = "-1";
      if (kind === "decimal") rates[0]!.unit_price = "1..2";
      if (kind === "unknown-mode")
        advanced.image_billing_mode = "future" as ImageBillingMode;
      expect(imagePriceProfiles(model)[1]!.status, kind).toBe("unavailable");
    }
  });
  it("reads legacy standard pricing without filling an advanced tariff", () => {
    const model = {
      ...pricedImageModel(),
      image_pricing: null,
      image_billing_mode: "image_count" as const,
      sales_price: tariff("image_count", "0.07"),
    };
    expect(imagePriceProfiles(model).map((profile) => profile.status)).toEqual([
      "configured",
      "unavailable",
    ]);
    expect(imageCountEstimate(imagePriceProfiles(model)[0], 1)).toBe("0.07");
    expect(
      publicFailure({
        code: "pricing_unavailable",
        message: "PRIVATE_UPSTREAM_MESSAGE",
      }).message,
    ).not.toContain("PRIVATE");
    expect(publicFailure({ code: "pricing_unavailable" }).message).toContain(
      "价格",
    );
  });
});

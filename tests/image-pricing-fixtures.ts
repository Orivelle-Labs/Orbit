import type {
  ImageApiParameters,
  ImageBillingMode,
  ImagePricingProfile,
  ImagePricingScenario,
  PriceView,
  PricingMeter,
} from "../src/shared/contracts";
import { imageModel } from "./fixtures";
import catalog from "./contracts/images-api-catalog.json" with { type: "json" };
import fixture from "./contracts/images-pricing.json" with { type: "json" };

export function pricedImageModel(id = "priced-image") {
  return {
    ...imageModel(id),
    image_api_parameters: catalog.models[
      "gpt-image-2.6-flare"
    ] as ImageApiParameters,
    image_pricing: fixture.profiles.map((profile) => ({
      scenario: profile.scenario as ImagePricingScenario,
      configured: profile.configured,
      image_billing_mode: profile.image_billing_mode as ImageBillingMode,
      pricing: {
        currency: profile.pricing.currency,
        source: "sales" as const,
        status: "configured" as const,
        rates: profile.pricing.meters.map((rate) => ({
          ...rate,
          meter: rate.meter as PricingMeter,
        })),
      },
    })) as ImagePricingProfile[],
  };
}

export function tariff(
  mode: ImageBillingMode,
  price: string,
  currency = "USD",
): PriceView {
  const meters: PricingMeter[] =
    mode === "image_count"
      ? ["image"]
      : [
          "text_input",
          "cached_text_input",
          "image_input",
          "cached_image_input",
          "image_output",
        ];
  return {
    currency,
    source: "sales",
    status: "configured",
    rates: meters.map((meter) => ({
      meter,
      unit_size: mode === "image_count" ? 1 : 1_000_000,
      unit_price: price,
    })),
  };
}

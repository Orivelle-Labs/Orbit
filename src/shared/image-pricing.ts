import type {
  ImageBillingMode,
  ImagePricingScenario,
  ModelView,
  PriceView,
  PricingMeter,
} from "./contracts";
import { formatMoney } from "./format";

export const IMAGE_TOKEN_METERS = [
  "text_input",
  "cached_text_input",
  "image_input",
  "cached_image_input",
  "image_output",
] as const satisfies readonly PricingMeter[];

export type ImagePriceProfile = {
  scenario: ImagePricingScenario;
  status: "configured" | "unconfigured" | "unavailable";
  image_billing_mode: ImageBillingMode | null;
  pricing: PriceView | null;
};

function validDecimal(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^\d+(?:\.\d+)?$/.test(value)
  );
}

function validTariff(
  price: PriceView | null,
  mode: ImageBillingMode | null,
): boolean {
  if (
    !price ||
    price.status !== "configured" ||
    !price.currency ||
    !/^[A-Za-z0-9]{1,16}$/.test(price.currency)
  )
    return false;
  const meters: readonly PricingMeter[] =
    mode === "image_count"
      ? ["image"]
      : mode === "image_tokens_v1"
        ? IMAGE_TOKEN_METERS
        : [];
  const unit = mode === "image_count" ? 1 : 1_000_000;
  return (
    meters.length > 0 &&
    price.rates.length === meters.length &&
    meters.every(
      (meter) =>
        price.rates.filter((rate) => rate.meter === meter).length === 1,
    ) &&
    price.rates.every(
      (rate) => rate.unit_size === unit && validDecimal(rate.unit_price),
    )
  );
}

export function imagePriceProfiles(
  model: ModelView | null,
): ImagePriceProfile[] {
  return (["standard", "advanced"] as const).map((scenario) => {
    const unavailable: ImagePriceProfile = {
      scenario,
      status: "unavailable",
      image_billing_mode: null,
      pricing: null,
    };
    if (!model) return unavailable;
    const declared = model.image_pricing;
    if (declared != null) {
      const matches = declared.filter(
        (profile) => profile.scenario === scenario,
      );
      if (matches.length !== 1) return unavailable;
      const profile = matches[0]!;
      if (!profile.configured)
        return { ...unavailable, status: "unconfigured" };
      return validTariff(profile.pricing, profile.image_billing_mode)
        ? { ...profile, status: "configured" as const }
        : unavailable;
    }
    // A legacy single tariff describes standard calls only; it never fills advanced pricing.
    if (scenario === "advanced") return unavailable;
    if (model.sales_price?.status === "unconfigured")
      return { ...unavailable, status: "unconfigured" };
    return validTariff(model.sales_price, model.image_billing_mode)
      ? {
          scenario,
          status: "configured",
          image_billing_mode: model.image_billing_mode,
          pricing: model.sales_price,
        }
      : unavailable;
  });
}

export function imageCountEstimate(
  profile: ImagePriceProfile | undefined,
  count: number,
): string | null {
  if (
    !profile ||
    profile.status !== "configured" ||
    profile.image_billing_mode !== "image_count" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10
  )
    return null;
  const value =
    profile.pricing?.rates.find((rate) => rate.meter === "image")?.unit_price ??
    null;
  if (!validDecimal(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const result = (BigInt(whole + fraction) * BigInt(count))
    .toString()
    .padStart(fraction.length + 1, "0");
  return fraction.length
    ? result.slice(0, -fraction.length) + "." + result.slice(-fraction.length)
    : result;
}

export function formatImagePrice(
  amount: string | null,
  currency: string | null,
): string {
  const formatted = formatMoney({ amount, currency, status: "known" });
  return currency === "USD" ? formatted.replace(/^USD /, "$") : formatted;
}

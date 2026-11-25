//! Catalog sales tariffs are display/preflight data. Panel freezes and settles actual prices.
use crate::{
    dto::*,
    error::{Result, fail},
};

pub const TOKEN_METERS: [&str; 5] = [
    "text_input",
    "cached_text_input",
    "image_input",
    "cached_image_input",
    "image_output",
];

pub fn valid_tariff(price: &PriceView, mode: &str) -> bool {
    let (meters, unit): (&[&str], u64) = match mode {
        "image_count" => (&["image"], 1),
        "image_tokens_v1" => (&TOKEN_METERS, 1_000_000),
        _ => return false,
    };
    price.status == "configured"
        && price.currency.as_ref().is_some_and(|v| {
            !v.is_empty() && v.len() <= 16 && v.bytes().all(|b| b.is_ascii_alphanumeric())
        })
        && price.rates.len() == meters.len()
        && meters.iter().all(|meter| {
            price
                .rates
                .iter()
                .filter(|rate| rate.meter == *meter)
                .count()
                == 1
        })
        && price.rates.iter().all(|rate| {
            rate.unit_size == unit && rate.unit_price.as_deref().is_some_and(valid_decimal)
        })
}

fn valid_decimal(value: &str) -> bool {
    if value.is_empty() || value.len() > 80 {
        return false;
    }
    let mut parts = value.split('.');
    let digits = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    parts.next().is_some_and(digits) && parts.next().is_none_or(digits) && parts.next().is_none()
}

pub fn ensure_available(model: &ModelView, advanced: bool) -> Result<()> {
    // An older Panel/cache does not declare the new two-scenario contract.
    let Some(profiles) = &model.image_pricing else {
        return Ok(());
    };
    let scenario = if advanced { "advanced" } else { "standard" };
    if profiles
        .iter()
        .find(|p| p.scenario == scenario)
        .is_some_and(|profile| {
            profile.configured
                && profile
                    .pricing
                    .as_ref()
                    .zip(profile.image_billing_mode.as_deref())
                    .is_some_and(|(price, mode)| valid_tariff(price, mode))
        })
    {
        Ok(())
    } else {
        Err(fail("pricing_unavailable"))
    }
}

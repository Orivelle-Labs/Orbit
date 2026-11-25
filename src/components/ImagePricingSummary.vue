<script setup lang="ts">
import { computed, ref } from "vue";
import type { ImagePricingScenario, ModelView } from "../shared/contracts";
import {
  IMAGE_TOKEN_METERS,
  formatImagePrice,
  imageCountEstimate,
  imagePriceProfiles,
  type ImagePriceProfile,
} from "../shared/image-pricing";
import { t, type MessageKey } from "../shared/i18n";
import OrbitDialog from "./OrbitDialog.vue";

const props = defineProps<{
  model: ModelView;
  scenario: ImagePricingScenario;
  count: number;
}>();
const details = ref(false);
const profiles = computed(() => imagePriceProfiles(props.model));
const current = computed(() =>
  profiles.value.find((profile) => profile.scenario === props.scenario)!,
);
const estimate = computed(() => imageCountEstimate(current.value, props.count));
const currency = computed(() => {
  const currencies = [
    ...new Set(
      profiles.value.flatMap((profile) =>
        profile.pricing?.currency ? [profile.pricing.currency] : [],
      ),
    ),
  ];
  return currencies.length === 1 ? currencies[0] : null;
});
const meterLabels: Record<(typeof IMAGE_TOKEN_METERS)[number], MessageKey> = {
  text_input: "images.pricingTextInput",
  cached_text_input: "images.pricingCachedTextInput",
  image_input: "images.pricingImageInput",
  cached_image_input: "images.pricingCachedImageInput",
  image_output: "images.pricingImageOutput",
};
function tokenRows(profile: ImagePriceProfile) {
  return IMAGE_TOKEN_METERS.flatMap((meter) => {
    const rate = profile.pricing?.rates.find((rate) => rate.meter === meter);
    return rate
      ? [
          {
            ...rate,
            label: meterLabels[meter],
            cacheNotApplicable:
              props.model.execution_profile === "codex-images-json-v1" &&
              meter.startsWith("cached_"),
          },
        ]
      : [];
  });
}
function countPrice(profile: ImagePriceProfile) {
  return (
    profile.pricing?.rates.find((rate) => rate.meter === "image")?.unit_price ??
    null
  );
}
</script>

<template>
  <section class="image-pricing-summary" :aria-label="t('images.pricingLabel')">
    <div class="image-pricing-copy" role="status" aria-live="polite">
      <span class="image-pricing-scenario">{{
        t(
          scenario === "standard"
            ? "images.pricingStandard"
            : "images.pricingAdvanced",
        )
      }}</span>
      <span aria-hidden="true">·</span>
      <span
        v-if="current.status === 'unconfigured'"
        class="image-pricing-warning"
        >{{ t("images.pricingUnconfigured") }}</span
      >
      <span v-else-if="current.status === 'unavailable'">{{
        t("images.pricingUnavailable")
      }}</span>
      <span v-else-if="current.image_billing_mode === 'image_tokens_v1'">{{
        t("images.pricingByToken")
      }}</span>
      <span v-else
        >{{ t("images.pricingEstimate") }}
        <span class="image-pricing-estimate">{{
          formatImagePrice(estimate, current.pricing?.currency ?? null)
        }}</span></span
      >
    </div>
    <button type="button" class="text-button" @click="details = true">
      {{ t("images.pricingView") }}
    </button>
  </section>

  <OrbitDialog
    :open="details"
    :title="t('images.pricingTitle')"
    content-class="image-pricing-dialog"
    @update:open="details = $event"
  >
    <p class="image-pricing-dialog-description">
      {{ t("images.pricingAccount")
      }}<template v-if="currency"> · {{ currency }}</template>
    </p>
    <div class="image-pricing-profiles">
      <section
        v-for="profile in profiles"
        :key="profile.scenario"
        class="image-pricing-profile"
        :class="{ current: profile.scenario === scenario }"
      >
        <div class="image-pricing-profile-heading">
          <h3>
            {{
              t(
                profile.scenario === "standard"
                  ? "images.pricingStandardTitle"
                  : "images.pricingAdvancedTitle",
              )
            }}
          </h3>
          <span
            v-if="profile.scenario === scenario"
            class="image-pricing-current"
            >{{ t("images.pricingCurrent") }}</span
          >
        </div>
        <p
          v-if="profile.status !== 'configured'"
          class="image-pricing-profile-unit"
        >
          {{
            t(
              profile.status === "unconfigured"
                ? "images.pricingUnconfiguredDetail"
                : "images.pricingUnavailableDetail",
            )
          }}
        </p>
        <template v-else>
          <p class="image-pricing-profile-unit">
            {{
              t(
                profile.image_billing_mode === "image_count"
                  ? "images.pricingByImage"
                  : "images.pricingByToken",
              )
            }}
          </p>
          <p
            v-if="profile.image_billing_mode === 'image_count'"
            class="image-pricing-profile-price"
          >
            {{
              formatImagePrice(
                countPrice(profile),
                profile.pricing?.currency ?? null,
              )
            }}<span>/ {{ t("images.pricingImageUnit") }}</span>
          </p>
          <dl v-else class="image-pricing-token-rates">
            <div v-for="row in tokenRows(profile)" :key="row.meter">
              <dt>
                {{ t(row.label)
                }}<small v-if="row.cacheNotApplicable">{{
                  t("images.pricingCacheNotApplicable")
                }}</small>
              </dt>
              <dd>
                {{
                  formatImagePrice(
                    row.unit_price,
                    profile.pricing?.currency ?? null,
                  )
                }}
                <span>/ 1M token</span>
              </dd>
            </div>
          </dl>
        </template>
        <p class="image-pricing-profile-description">
          {{
            t(
              profile.scenario === "standard"
                ? "images.pricingStandardHint"
                : "images.pricingAdvancedHint",
            )
          }}
        </p>
      </section>
    </div>
    <p class="image-pricing-dialog-note">
      {{ t("images.pricingScenarioHint") }}
    </p>
    <div class="image-pricing-dialog-footer">
      <span>{{ t("images.pricingActualHint") }}</span>
      <button type="button" class="button secondary" @click="details = false">
        {{ t("images.pricingClose") }}
      </button>
    </div>
  </OrbitDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  HistoryImage,
  ImageParameters,
  TaskView,
} from "../shared/contracts";
import { formatBytes, formatUpdatedAt, safePreviewUrl } from "../shared/format";
import { t, type MessageKey } from "../shared/i18n";
import {
  imageCountLabel,
  imageParameterLabel,
} from "../shared/image-parameters";
import OrbitDialog from "./OrbitDialog.vue";
import OrbitIcon from "./OrbitIcon.vue";

const props = defineProps<{
  image: HistoryImage | null;
  task: TaskView | null;
  title: string;
  canRename: boolean;
}>();
defineEmits<{
  close: [];
  rename: [image: HistoryImage];
  zoom: [image: HistoryImage];
}>();
// A history image can outlive its task. Never borrow another account's metadata.
const task = computed(() =>
  props.image &&
  props.task?.id === props.image.task_id &&
  props.task.account_id === props.image.account_id
    ? props.task
    : null,
);
const format = computed(() =>
  props.image?.mime === "image/svg+xml"
    ? "SVG"
    : props.image?.mime.replace("image/", "").toUpperCase(),
);
const preview = computed(() =>
  safePreviewUrl(props.image?.preview_url ?? null),
);
const parameterRows = computed(() => {
  const parameters = task.value?.parameters;
  function value(key: keyof ImageParameters): string {
    const saved = parameters?.[key];
    if (saved === undefined || saved === null) return t("images.notRecorded");
    if (key === "n") return imageCountLabel(Number(saved));
    if (typeof saved === "boolean")
      return t(saved ? "images.enabled" : "images.disabled");
    if (key === "size" && saved !== "auto")
      return String(saved).replace("x", " × ");
    return imageParameterLabel(String(saved));
  }
  const rows: { label: MessageKey; value: string }[] = [
    {
      label: "images.requestedModel",
      value:
        task.value?.requested_model_label ||
        props.image?.requested_model ||
        t("images.notRecorded"),
    },
    {
      label: "images.creationKind",
      value: task.value
        ? t(task.value.kind === "edit" ? "images.edit" : "images.generate")
        : t("images.notRecorded"),
    },
    { label: "images.size", value: value("size") },
    { label: "images.requestedQuality", value: value("quality") },
    { label: "images.requestedBackground", value: value("background") },
    { label: "images.requestedCount", value: value("n") },
  ];
  const optional: [keyof ImageParameters, MessageKey][] = [
    ["output_format", "images.outputFormat"],
    ["output_compression", "images.compression"],
    ["complexity", "images.complexity"],
    ["stream", "images.stream"],
    ["moderation", "images.moderation"],
    ["input_fidelity", "images.inputFidelity"],
    ["frame_count", "images.frameCount"],
    ["frame_duration_ms", "images.frameDuration"],
  ];
  if (parameters?.stream)
    optional.push(["partial_images", "images.partialImages"]);
  for (const [key, label] of optional)
    if (parameters?.[key] !== undefined)
      rows.push({ label, value: value(key) });
  if (parameters?.svg) {
    rows.push({ label: "images.svgAuthor", value: parameters.svg.model });
    if (parameters.svg.reasoning?.effort)
      rows.push({
        label: "images.svgReasoning",
        value: imageParameterLabel(parameters.svg.reasoning.effort),
      });
  }
  return rows;
});
</script>

<template>
  <OrbitDialog
    :open="image !== null"
    :title="t('images.details')"
    content-class="image-history-dialog"
    @update:open="
      (open) => {
        if (!open) $emit('close');
      }
    "
  >
    <template v-if="image">
      <div class="image-history-details">
        <div class="image-details-preview">
          <button
            class="image-preview-button"
            :disabled="!preview"
            :aria-label="t('images.zoom')"
            @click="$emit('zoom', image)"
          >
            <img
              v-if="preview"
              :src="preview"
              :alt="task?.prompt || title"
              :width="image.width"
              :height="image.height"
            />
            <OrbitIcon v-else name="images" :size="32" />
          </button>
          <div class="image-details-caption">
            <span>{{ image.width }} × {{ image.height }}</span>
            <button
              class="text-button"
              :disabled="!preview"
              @click="$emit('zoom', image)"
            >
              <OrbitIcon name="external" :size="14" />{{ t("images.zoom") }}
            </button>
          </div>
          <p v-if="image.mime === 'image/gif'" class="field-hint">
            {{ t("images.gifPreviewHint") }}
          </p>
          <section class="image-details-file">
            <h3>{{ t("images.fileInfo") }}</h3>
            <dl class="image-details-facts">
              <div>
                <dt>{{ t("images.actualSize") }}</dt>
                <dd>{{ image.width }} × {{ image.height }}</dd>
              </div>
              <div>
                <dt>{{ t("images.fileFormat") }}</dt>
                <dd>{{ format }}</dd>
              </div>
              <div>
                <dt>{{ t("images.fileSize") }}</dt>
                <dd>{{ formatBytes(image.bytes) }}</dd>
              </div>
            </dl>
          </section>
        </div>
        <div class="image-details-info">
          <div>
            <div class="image-details-title-row">
              <h3 class="image-details-title">{{ title }}</h3>
              <button
                class="icon-button"
                :aria-label="t('images.rename')"
                :title="t('images.rename')"
                :disabled="!canRename"
                @click="$emit('rename', image)"
              >
                <OrbitIcon name="edit" :size="15" />
              </button>
            </div>
            <p class="image-details-date">
              <time :datetime="image.created_at">{{
                formatUpdatedAt(image.created_at)
              }}</time>
              · {{ t("images.completed") }}
            </p>
          </div>
          <section>
            <h3>{{ t("images.prompt") }}</h3>
            <p class="image-details-prompt">
              {{ task?.prompt || t("images.notRecorded") }}
            </p>
          </section>
          <section>
            <h3>{{ t("images.generationParameters") }}</h3>
            <dl class="image-details-facts">
              <div v-for="row in parameterRows" :key="row.label">
                <dt>{{ t(row.label) }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
      <div class="image-details-request">
        <span>Request ID</span
        ><code>{{ task?.request_id || t("images.notRecorded") }}</code>
      </div>
      <div class="dialog-actions image-details-actions">
        <slot name="actions" />
      </div>
    </template>
  </OrbitDialog>
</template>

<style scoped>
.image-history-details {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}
.image-details-preview {
  min-width: 0;
}
.image-details-preview .image-preview-button {
  aspect-ratio: 3 / 2;
  border-radius: 6px;
  overflow: hidden;
}
.image-details-preview .image-preview-button img {
  height: 100%;
  object-fit: contain;
}
.image-details-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 11px;
}
.image-details-caption .text-button {
  font-size: 11px;
}
.image-details-file {
  border-top: 1px solid var(--line);
  margin-top: 20px;
  padding-top: 17px;
}
.image-details-info {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.image-history-details h3 {
  margin: 0 0 10px;
  font-size: 13px;
}
.image-details-title-row {
  display: flex;
  align-items: start;
  gap: 8px;
}
.image-details-title-row .image-details-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 4px;
  overflow-wrap: anywhere;
}
.image-details-title-row .icon-button {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  padding: 4px;
}
.image-details-date {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.7;
}
.image-details-prompt {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.85;
}
.image-details-facts {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  font-size: 11px;
}
.image-details-facts > div {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
}
.image-details-facts dt {
  color: var(--muted);
}
.image-details-facts dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
.image-details-request {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 9px;
  border-top: 1px solid var(--line);
  padding-top: 15px;
  margin-top: 20px;
  font-size: 11px;
  color: var(--muted);
}
.image-details-request code {
  font-size: 10px;
  overflow-wrap: anywhere;
  min-width: 0;
}
.image-details-actions {
  flex-wrap: wrap;
  border-top: 1px solid var(--line);
  padding-top: 17px;
  margin-top: 20px;
}
@media (max-width: 680px) {
  .image-history-details {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }
  .image-details-preview .image-preview-button {
    max-height: 290px;
  }
  .image-details-actions {
    justify-content: flex-start;
    gap: 8px;
  }
}
</style>

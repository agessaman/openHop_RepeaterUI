<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ApiService } from '@/utils/api';
import type { RadioFrontendSettings, RadioFrontendStatus } from '@/generated/openapi';

// Front-end controls apply to the modem immediately (no restart), so this card
// saves on its own rather than through the hardware form's restart flow.

const props = defineProps<{
  /** Set on a multi-radio node: the controls act on this radio only. */
  defaultRadioId?: string;
}>();

type GainChoice = 'on' | 'off' | '';

const status = ref<RadioFrontendStatus | null>(null);
const loading = ref(true);
const isEditing = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const agcInput = ref<number | null>(null);
// On/off controls. Boosted RX gain is the radio chip's own (MeshCore radio.rxgain),
// independent of the external FEM LNA.
type GainKey = 'fem_rx_gain' | 'fem_tx_gain' | 'rx_boosted_gain';
const gainInput = reactive<Record<GainKey, GainChoice>>({
  fem_rx_gain: '',
  fem_tx_gain: '',
  rx_boosted_gain: '',
});
const gainRows: ReadonlyArray<{ key: GainKey; label: string; hint?: string }> = [
  { key: 'fem_rx_gain', label: 'FEM RX Gain (LNA)' },
  { key: 'fem_tx_gain', label: 'FEM TX Gain (PA)' },
  { key: 'rx_boosted_gain', label: 'Radio RX Boosted Gain', hint: 'The LoRa chip’s own gain mode' },
];

const supports = computed(() => status.value?.supports);
const hasAnyControl = computed(
  () =>
    !!supports.value &&
    (supports.value.agc_reset_interval_seconds ||
      supports.value.fem_rx_gain ||
      supports.value.fem_tx_gain ||
      supports.value.rx_boosted_gain),
);

async function load() {
  loading.value = true;
  try {
    const result = await ApiService.getRadioFrontend();
    status.value = result.success ? result.data : null;
  } catch {
    status.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function agcLabel(seconds: number | undefined): string {
  if (seconds === undefined) return 'Unknown';
  return seconds === 0 ? 'Off' : `${seconds} s`;
}

function gainLabel(value: boolean | undefined): string {
  if (value === undefined) return 'Unknown';
  return value ? 'On' : 'Off';
}

function configuredNote(key: keyof RadioFrontendSettings): string {
  return status.value?.configured[key] === undefined ? ' (board default)' : '';
}

function gainChoice(value: boolean | undefined): GainChoice {
  return value === undefined ? '' : value ? 'on' : 'off';
}

function startEditing() {
  const running = status.value?.running ?? {};
  agcInput.value = running.agc_reset_interval_seconds ?? null;
  for (const { key } of gainRows) gainInput[key] = gainChoice(running[key]);
  errorMessage.value = '';
  successMessage.value = '';
  isEditing.value = true;
}

function cancelEditing() {
  isEditing.value = false;
  errorMessage.value = '';
}

/** Only settings the operator changed from what the modem runs are sent. */
function buildChanges(): RadioFrontendSettings | string {
  const running = status.value?.running ?? {};
  const changes: RadioFrontendSettings = {};
  if (supports.value?.agc_reset_interval_seconds && agcInput.value !== null) {
    const agc = Number(agcInput.value);
    if (!Number.isInteger(agc) || agc < 0 || agc > 1020) {
      return 'AGC reset interval must be a whole number of seconds, 0-1020';
    }
    if (agc !== running.agc_reset_interval_seconds) changes.agc_reset_interval_seconds = agc;
  }
  for (const { key } of gainRows) {
    if (!supports.value?.[key] || !gainInput[key]) continue;
    const enabled = gainInput[key] === 'on';
    if (enabled !== running[key]) changes[key] = enabled;
  }
  return changes;
}

async function saveChanges() {
  const changes = buildChanges();
  if (typeof changes === 'string') {
    errorMessage.value = changes;
    return;
  }
  if (Object.keys(changes).length === 0) {
    isEditing.value = false;
    return;
  }
  isSaving.value = true;
  errorMessage.value = '';
  try {
    const result = await ApiService.setRadioFrontend(changes);
    if (result.data) status.value = result.data;
    if (result.success) {
      const agc = result.data?.applied.agc_reset_interval_seconds;
      successMessage.value =
        agc !== undefined && agc !== changes.agc_reset_interval_seconds
          ? `Applied. AGC reset interval rounded to ${agc} s.`
          : 'Applied to the radio.';
      isEditing.value = false;
      setTimeout(() => (successMessage.value = ''), 4000);
    } else {
      errorMessage.value = result.error || 'Failed to apply settings';
    }
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } }; message?: string };
    errorMessage.value = e.response?.data?.error || e.message || 'Failed to apply settings';
  } finally {
    isSaving.value = false;
  }
}

defineExpose({ reload: load, isEditing });
</script>

<template>
  <div
    v-if="!loading && status?.available"
    class="cfg-section space-y-3 rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-3 sm:p-4"
    data-testid="radio-frontend"
  >
    <div
      class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pb-2 border-b border-stroke-subtle dark:border-stroke/opacity-light"
    >
      <div>
        <div class="text-sm font-semibold text-content-primary">RF Front End</div>
        <div class="text-xs text-content-muted mt-1">
          KISS modem controls, applied immediately without a restart<template
            v-if="props.defaultRadioId"
          >
            to the default radio (<span class="font-mono font-semibold">{{
              props.defaultRadioId
            }}</span
            >) only</template
          >.
        </div>
      </div>
      <div v-if="hasAnyControl" class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="!isEditing"
          class="cfg-btn-secondary"
          data-testid="frontend-edit"
          @click="startEditing"
        >
          Edit
        </button>
        <template v-else>
          <button class="cfg-btn-secondary" :disabled="isSaving" @click="cancelEditing">
            Cancel
          </button>
          <button
            class="cfg-btn-primary"
            :disabled="isSaving"
            data-testid="frontend-save"
            @click="saveChanges"
          >
            {{ isSaving ? 'Applying...' : 'Apply' }}
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="successMessage"
      class="bg-accent-green/opacity-light dark:bg-accent-green/opacity-medium border border-accent-green dark:border-accent-green/opacity-heavy rounded-lg p-3 text-accent-green text-sm"
    >
      {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red dark:border-accent-red/opacity-heavy rounded-lg p-3 text-accent-red text-sm"
      data-testid="frontend-error"
    >
      {{ errorMessage }}
    </div>

    <p v-if="!hasAnyControl" class="text-xs text-content-muted" data-testid="frontend-none">
      This modem reports no front-end controls. They need MeshCore KISS firmware v2 or newer, and
      FEM gain also needs a board that exposes it.
    </p>

    <template v-else>
      <div
        v-if="supports?.agc_reset_interval_seconds"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          AGC Reset Interval
          <span class="block text-[11px] text-content-muted"
            >Seconds, rounded down to a multiple of 4; 0 turns it off</span
          >
        </span>
        <span
          v-if="!isEditing"
          class="text-content-primary font-mono text-sm"
          data-testid="frontend-agc"
        >
          {{ agcLabel(status.running.agc_reset_interval_seconds)
          }}{{ configuredNote('agc_reset_interval_seconds') }}
        </span>
        <input
          v-else
          v-model.number="agcInput"
          type="number"
          min="0"
          max="1020"
          step="4"
          class="cfg-input w-full sm:w-32"
          data-testid="frontend-agc-input"
        />
      </div>

      <div
        v-for="row in gainRows"
        :key="row.key"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          {{ row.label }}
          <span v-if="row.hint" class="block text-[11px] text-content-muted">{{ row.hint }}</span>
        </span>
        <template v-if="supports?.[row.key]">
          <span
            v-if="!isEditing"
            class="text-content-primary font-mono text-sm"
            :data-testid="`frontend-${row.key}`"
          >
            {{ gainLabel(status.running[row.key]) }}{{ configuredNote(row.key) }}
          </span>
          <select
            v-else
            v-model="gainInput[row.key]"
            class="cfg-select w-full sm:w-32"
            :data-testid="`frontend-${row.key}-input`"
          >
            <option v-if="gainInput[row.key] === ''" value="" disabled>Unknown</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </template>
        <span v-else class="text-content-muted text-sm" :data-testid="`frontend-${row.key}`"
          >Not available on this board</span
        >
      </div>
    </template>
  </div>
</template>

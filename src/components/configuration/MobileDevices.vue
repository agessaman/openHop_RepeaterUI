<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import QRCode from 'qrcode';
import ApiService from '@/utils/api';
import ConfirmDialog from '@/components/modals/ConfirmDialog.vue';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'MobileDevices' });

interface Companion {
  name: string;
  companion_hash: string;
  node_name: string;
  public_key: string;
}

interface MobileDevice {
  id: number;
  companion_hash: string;
  device_id: string;
  name: string;
  token_id: number;
  platform: string | null;
  created_at: number;
  last_seen: number | null;
}

interface PairingSession {
  code: string;
  expires_in: number;
  companion_name: string;
  fingerprint: string;
}

const devices = ref<MobileDevice[]>([]);
const companions = ref<Companion[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

const showPairModal = ref(false);
const selectedCompanion = ref<string>('');
const isPairing = ref(false);
const pairError = ref<string | null>(null);
const pairingSession = ref<PairingSession | null>(null);
const qrDataUrl = ref<string | null>(null);
const secondsRemaining = ref(0);
const codeCopied = ref(false);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const showRevokeConfirm = ref(false);
const deviceToRevoke = ref<{ device_id: string; name: string } | null>(null);

const isExpired = computed(() => pairingSession.value !== null && secondsRemaining.value <= 0);

const companionByHash = computed(() => {
  const map: Record<string, Companion> = {};
  for (const c of companions.value) {
    map[c.companion_hash] = c;
  }
  return map;
});

function companionLabel(hash: string): string {
  return companionByHash.value[hash]?.name || hash;
}

const fetchDevices = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await ApiService.getMobileDevices();
    devices.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch mobile devices:', err);
    error.value = err instanceof Error ? err.message : 'Failed to fetch mobile devices';
  } finally {
    isLoading.value = false;
  }
};

const fetchCompanions = async () => {
  try {
    const response = await ApiService.getCompanions();
    companions.value = response.data || [];
    if (!selectedCompanion.value && companions.value.length > 0) {
      selectedCompanion.value = companions.value[0].name;
    }
  } catch (err) {
    console.error('Failed to fetch companions:', err);
    error.value = err instanceof Error ? err.message : 'Failed to fetch companions';
  }
};

const formatTimestamp = (timestamp: number | null) => {
  if (!timestamp) return 'Never';
  return new Date(timestamp * 1000).toLocaleString();
};

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startCountdown(seconds: number) {
  stopCountdown();
  secondsRemaining.value = Math.max(0, Math.floor(seconds));
  countdownTimer = setInterval(() => {
    secondsRemaining.value = Math.max(0, secondsRemaining.value - 1);
    if (secondsRemaining.value <= 0) {
      stopCountdown();
    }
  }, 1000);
}

const countdownLabel = computed(() => {
  const m = Math.floor(secondsRemaining.value / 60);
  const s = secondsRemaining.value % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

async function buildQrCode(session: PairingSession) {
  const payload = JSON.stringify({
    url: window.location.origin,
    fingerprint: session.fingerprint,
    code: session.code,
  });
  try {
    qrDataUrl.value = await QRCode.toDataURL(payload, { width: 256, margin: 1 });
  } catch (err) {
    console.error('Failed to render pairing QR code:', err);
    qrDataUrl.value = null;
  }
}

async function startPairing() {
  if (!selectedCompanion.value) {
    pairError.value = 'Select a companion to pair';
    return;
  }
  isPairing.value = true;
  pairError.value = null;
  codeCopied.value = false;
  try {
    const response = await ApiService.startPairing(selectedCompanion.value);
    const session = response.data;
    if (!session) {
      throw new Error('No pairing data returned');
    }
    pairingSession.value = session;
    startCountdown(session.expires_in);
    await buildQrCode(session);
    showPairModal.value = true;
  } catch (err) {
    console.error('Failed to start pairing:', err);
    pairError.value = err instanceof Error ? err.message : 'Failed to start pairing';
  } finally {
    isPairing.value = false;
  }
}

async function regeneratePairing() {
  if (!pairingSession.value) return;
  isPairing.value = true;
  pairError.value = null;
  try {
    const response = await ApiService.startPairing(pairingSession.value.companion_name);
    const session = response.data;
    if (!session) {
      throw new Error('No pairing data returned');
    }
    pairingSession.value = session;
    codeCopied.value = false;
    startCountdown(session.expires_in);
    await buildQrCode(session);
  } catch (err) {
    console.error('Failed to regenerate pairing code:', err);
    pairError.value = err instanceof Error ? err.message : 'Failed to regenerate pairing code';
  } finally {
    isPairing.value = false;
  }
}

function closePairModal() {
  showPairModal.value = false;
  pairingSession.value = null;
  qrDataUrl.value = null;
  pairError.value = null;
  stopCountdown();
  // Refresh device list in case a device paired while the modal was open.
  fetchDevices();
}

function copyCode() {
  if (!pairingSession.value) return;
  navigator.clipboard.writeText(pairingSession.value.code);
  codeCopied.value = true;
  setTimeout(() => {
    codeCopied.value = false;
  }, 2000);
}

function openRevokeConfirm(device: MobileDevice) {
  deviceToRevoke.value = { device_id: device.device_id, name: device.name };
  showRevokeConfirm.value = true;
}

async function revokeDevice() {
  if (!deviceToRevoke.value) return;
  isLoading.value = true;
  error.value = null;
  try {
    await ApiService.revokeMobileDevice(deviceToRevoke.value.device_id);
    await fetchDevices();
    showRevokeConfirm.value = false;
    deviceToRevoke.value = null;
  } catch (err) {
    console.error('Failed to revoke mobile device:', err);
    error.value = err instanceof Error ? err.message : 'Failed to revoke device';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchDevices();
  fetchCompanions();
});

onUnmounted(() => {
  stopCountdown();
});
</script>

<template>
  <div class="space-y-4 sm:space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h2 class="text-lg sm:text-xl font-semibold text-content-primary">
          Mobile Devices
        </h2>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm mt-1">
          Manage paired mobile companion apps
        </p>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <select
          v-model="selectedCompanion"
          :disabled="companions.length === 0"
          class="cfg-select disabled:opacity-50"
        >
          <option v-if="companions.length === 0" value="">No companions configured</option>
          <option v-for="c in companions" :key="c.companion_hash" :value="c.name">
            {{ c.name }}
          </option>
        </select>
        <button
          @click="startPairing"
          :disabled="isPairing || companions.length === 0"
          class="cfg-btn-primary flex items-center justify-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          {{ isPairing ? 'Starting…' : 'Pair New Device' }}
        </button>
      </div>
    </div>

    <!-- Info Box -->
    <div
      class="bg-accent-cyan/opacity-light border border-accent-cyan/opacity-medium rounded-lg p-3 sm:p-4"
    >
      <div class="flex gap-2 sm:gap-3 text-accent-cyan">
        <svg
          class="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p class="text-xs sm:text-sm">
          Pair a phone by picking a companion identity, then scan the QR code with the mobile
          app. Pairing codes are single-use and expire after 5 minutes.
        </p>
      </div>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      class="bg-accent-red/opacity-light border border-accent-red/opacity-medium rounded-lg p-4"
    >
      <div class="flex items-center gap-2 text-accent-red">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {{ error }}
      </div>
    </div>

    <div
      v-if="pairError && !showPairModal"
      class="bg-accent-red/opacity-light border border-accent-red/opacity-medium rounded-lg p-4"
    >
      <div class="flex items-center gap-2 text-accent-red">
        {{ pairError }}
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && devices.length === 0" class="flex items-center justify-center py-12">
      <div class="text-center">
        <Spinner class="mx-auto mb-4" />
        <div class="text-content-secondary dark:text-content-muted">Loading devices...</div>
      </div>
    </div>

    <!-- Devices Table -->
    <div
      v-else-if="devices.length > 0"
      class="overflow-x-auto rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light"
    >
      <table class="min-w-full text-sm">
        <thead class="bg-background-mute dark:bg-white/opacity-subtle">
          <tr class="text-left text-content-secondary dark:text-content-muted">
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium">Name</th>
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium">Platform</th>
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium">Companion</th>
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium">Created</th>
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium">Last Seen</th>
            <th class="px-3 sm:px-4 py-2 sm:py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stroke-subtle dark:divide-stroke/opacity-light">
          <tr
            v-for="device in devices"
            :key="device.device_id"
            class="hover:bg-stroke-subtle dark:hover:bg-white/opacity-subtle transition-colors"
          >
            <td class="px-3 sm:px-4 py-2 sm:py-3 text-content-primary break-all">
              {{ device.name }}
            </td>
            <td class="px-3 sm:px-4 py-2 sm:py-3 text-content-secondary dark:text-content-muted">
              {{ device.platform || 'Unknown' }}
            </td>
            <td class="px-3 sm:px-4 py-2 sm:py-3 text-content-secondary dark:text-content-muted">
              {{ companionLabel(device.companion_hash) }}
            </td>
            <td
              class="px-3 sm:px-4 py-2 sm:py-3 text-content-secondary dark:text-content-muted whitespace-nowrap"
            >
              {{ formatTimestamp(device.created_at) }}
            </td>
            <td
              class="px-3 sm:px-4 py-2 sm:py-3 text-content-secondary dark:text-content-muted whitespace-nowrap"
            >
              {{ formatTimestamp(device.last_seen) }}
            </td>
            <td class="px-3 sm:px-4 py-2 sm:py-3 text-right">
              <button
                @click="openRevokeConfirm(device)"
                :disabled="isLoading"
                class="px-3 py-1.5 bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium hover:bg-accent-red/opacity-medium text-accent-red rounded-lg border border-accent-red/opacity-heavy transition-colors disabled:opacity-50 text-sm"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <svg
        class="w-16 h-16 text-content-muted mx-auto mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      <h3 class="text-content-primary font-medium mb-2">No Paired Devices</h3>
      <p class="text-content-secondary dark:text-content-muted text-sm mb-4">
        Pair a phone to get started with the mobile companion app
      </p>
      <button
        v-if="companions.length > 0"
        @click="startPairing"
        :disabled="isPairing"
        class="cfg-btn-primary"
      >
        Pair Your First Device
      </button>
      <p v-else class="text-content-muted text-xs">
        Configure a companion identity first (Identities → Companions).
      </p>
    </div>

    <!-- Pair Device Modal -->
    <div v-if="showPairModal" class="modal-backdrop" @click.self="closePairModal">
      <div
        class="bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/opacity-medium rounded-[15px] p-6 max-w-md w-full shadow-2xl"
      >
        <h3 class="text-xl font-semibold text-content-primary mb-4">Pair Mobile Device</h3>

        <div v-if="pairingSession" class="space-y-4">
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Scan this code with the mobile app for
            <strong>{{ pairingSession.companion_name }}</strong
            >.
          </p>

          <div class="flex justify-center bg-white rounded-lg p-4">
            <img
              v-if="qrDataUrl && !isExpired"
              :src="qrDataUrl"
              alt="Pairing QR code"
              class="w-48 h-48 sm:w-56 sm:h-56"
            />
            <div
              v-else-if="isExpired"
              class="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-center text-gray-500 text-sm p-4"
            >
              This pairing code has expired
            </div>
            <div
              v-else
              class="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-gray-400 text-sm"
            >
              Generating QR code…
            </div>
          </div>

          <div v-if="!isExpired">
            <label class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Pairing Code</label
            >
            <div class="flex gap-2">
              <input
                :value="pairingSession.code"
                readonly
                class="cfg-input flex-1 font-mono"
              />
              <button
                @click="copyCode"
                class="cfg-btn-secondary whitespace-nowrap"
                title="Copy to clipboard"
              >
                {{ codeCopied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <p class="text-xs text-content-muted mt-2">
              Expires in <span class="font-mono">{{ countdownLabel }}</span>
            </p>
          </div>

          <div
            v-if="pairError"
            class="bg-accent-red/opacity-light border border-accent-red/opacity-medium rounded-lg p-3"
          >
            <div class="text-sm text-accent-red">{{ pairError }}</div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button
              v-if="isExpired"
              @click="regeneratePairing"
              :disabled="isPairing"
              class="cfg-btn-primary"
            >
              {{ isPairing ? 'Generating…' : 'Regenerate Code' }}
            </button>
            <button @click="closePairModal" class="cfg-btn-secondary">Done</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Revoke Confirmation Dialog -->
  <ConfirmDialog
    :show="showRevokeConfirm"
    title="Revoke Device"
    :message="`Are you sure you want to revoke '${deviceToRevoke?.name}'? The device will lose access immediately and must be re-paired.`"
    confirm-text="Revoke"
    cancel-text="Cancel"
    variant="danger"
    @confirm="revokeDevice"
    @close="showRevokeConfirm = false"
  />
</template>

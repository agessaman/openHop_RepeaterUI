<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ApiService from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';
import { ACL_ASSIGNABLE_ROLES, normalizePublicKey } from '@/utils/aclRoles';

defineOptions({ name: 'AclEntryModal' });

interface AclIdentity {
  name: string;
  type?: string;
}

const props = defineProps<{
  show: boolean;
  identities: AclIdentity[];
  /** Identity to preselect, e.g. the one the list is filtered to. */
  initialIdentity?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', message: string): void;
}>();

const identityName = ref('');
const publicKeyText = ref('');
const role = ref(3);
const saving = ref(false);
const error = ref<string | null>(null);
const touched = ref(false);

const publicKey = computed(() => normalizePublicKey(publicKeyText.value));
const keyError = computed(() =>
  touched.value && publicKeyText.value.trim() && !publicKey.value
    ? 'Paste the full public key: 64 hex characters.'
    : null,
);
const selectedIdentity = computed(() =>
  props.identities.find((identity) => identity.name === identityName.value),
);
const isRoomServer = computed(() => selectedIdentity.value?.type === 'room_server');
const canSave = computed(() => !!identityName.value && !!publicKey.value && !saving.value);

watch(
  () => props.show,
  (open) => {
    if (!open) return;
    identityName.value =
      props.initialIdentity && props.identities.some((i) => i.name === props.initialIdentity)
        ? props.initialIdentity
        : (props.identities[0]?.name ?? '');
    publicKeyText.value = '';
    role.value = 3;
    error.value = null;
    touched.value = false;
  },
  { immediate: true },
);

async function save() {
  touched.value = true;
  if (!canSave.value || !publicKey.value) return;
  saving.value = true;
  error.value = null;
  try {
    const response = await ApiService.setACLPermissions({
      identity_name: identityName.value,
      client_pubkey: publicKey.value,
      permissions: role.value,
    });
    if (response.success) {
      emit('saved', response.message || 'Entry saved');
    } else {
      error.value = response.error || 'Could not save the entry';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save the entry';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-card max-w-lg shadow-xl" role="dialog" aria-labelledby="acl-entry-title">
        <h3 id="acl-entry-title" class="text-xl font-semibold text-content-primary mb-1">
          Add access entry
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-sm mb-4">
          The key can then log in with a blank password, the same as
          <code class="font-mono">setperm</code> on the CLI.
        </p>

        <form class="space-y-3" @submit.prevent="save">
          <div>
            <label for="acl-identity" class="modal-field-label">Identity</label>
            <select id="acl-identity" v-model="identityName" class="modal-select">
              <option v-for="identity in identities" :key="identity.name" :value="identity.name">
                {{ identity.name }}{{ identity.type === 'room_server' ? ' (room server)' : '' }}
              </option>
            </select>
          </div>

          <div>
            <label for="acl-pubkey" class="modal-field-label">Public key</label>
            <input
              id="acl-pubkey"
              v-model="publicKeyText"
              type="text"
              class="modal-input font-mono"
              placeholder="64 hex characters"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="!!keyError"
              aria-describedby="acl-pubkey-help"
              @blur="touched = true"
            />
            <p
              id="acl-pubkey-help"
              :class="['text-xs mt-1', keyError ? 'text-accent-red' : 'text-content-muted']"
            >
              {{ keyError || "The client's full public key, as shown in its app." }}
            </p>
          </div>

          <div>
            <label for="acl-role" class="modal-field-label">Role</label>
            <select id="acl-role" v-model.number="role" class="modal-select">
              <option
                v-for="option in ACL_ASSIGNABLE_ROLES"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <p v-if="isRoomServer && role !== 3" class="text-xs mt-1 text-accent-amber">
              Room servers keep only admins after a restart, as MeshCore firmware does. This entry
              lasts until the next restart.
            </p>
          </div>

          <div
            v-if="error"
            class="bg-accent-red/opacity-light border border-accent-red/opacity-medium rounded-lg p-3"
            role="alert"
          >
            <p class="text-accent-red text-sm">{{ error }}</p>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="modal-btn-cancel"
              :disabled="saving"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="modal-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!canSave"
            >
              <Spinner v-if="saving" size="sm" color="current" />
              {{ saving ? 'Saving…' : 'Add entry' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

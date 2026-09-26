<script setup lang="ts">
import { ref, toRef, useId } from 'vue';
import { useDialogFocus } from '@/composables/useDialogFocus';

interface Props {
  show: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface Emits {
  (e: 'close'): void;
  (e: 'confirm'): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm Action',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'warning',
});

const emit = defineEmits<Emits>();

const variantColors = {
  danger: 'bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border-accent-red/opacity-medium text-accent-red',
  warning:
    'bg-accent-amber/opacity-light dark:bg-accent-amber/opacity-medium border-accent-amber/opacity-medium text-accent-amber',
  info: 'bg-primary/opacity-medium border-primary/opacity-medium text-primary',
};

// White text on the light tint was unreadable in light mode; these keep AA
// contrast in both themes (main.css).
const buttonClasses = {
  danger: 'modal-btn-confirm-danger',
  warning: 'modal-btn-confirm-warning',
  info: 'modal-btn-confirm-info',
};

const dialog = ref<HTMLElement | null>(null);
const titleId = useId();
const messageId = useId();
useDialogFocus(toRef(props, 'show'), dialog, () => emit('close'));
</script>

<template>
  <Teleport to="body">
  <!-- Modal Backdrop -->
  <div
    v-if="props.show"
    @click.self="emit('close')"
    class="modal-backdrop"
  >
    <!-- Modal Content -->
    <div
      ref="dialog"
      class="modal-card max-w-md"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="messageId"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 :id="titleId" class="text-xl font-semibold text-content-primary">
          {{ props.title }}
        </h3>
        <button
          type="button"
          aria-label="Close"
          @click="emit('close')"
          class="text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Icon and Message -->
      <div class="mb-6">
        <div :class="['inline-flex p-3 rounded-xl mb-4', variantColors[props.variant]]">
          <!-- Danger Icon -->
          <svg
            v-if="props.variant === 'danger'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <!-- Warning Icon -->
          <svg
            v-else-if="props.variant === 'warning'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <!-- Info Icon -->
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p :id="messageId" class="text-content-secondary dark:text-content-primary/opacity-heavy text-base leading-relaxed">
          {{ props.message }}
        </p>
      </div>

      <!-- Actions -->
      <div class="modal-actions">
        <button type="button" class="modal-btn-cancel" @click="emit('close')">
          {{ props.cancelText }}
        </button>
        <button type="button" :class="buttonClasses[props.variant]" @click="emit('confirm')">
          {{ props.confirmText }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

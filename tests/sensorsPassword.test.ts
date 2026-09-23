import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Sensors from '@/views/Sensors.vue';

vi.mock('@/composables/useManagedPolling', () => ({ useManagedPolling: vi.fn() }));
vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: {
      sensors: {
        enabled: true,
        running: true,
        readings: [
          {
            name: 'modem',
            type: 'openhop_modem',
            ok: true,
            data: { password: 'private-value', signal: 42 },
          },
        ],
      },
    },
    fetchStats: vi.fn(),
  }),
}));

describe('Sensors page', () => {
  it('never displays a sensor password in the metrics grid', () => {
    const wrapper = mount(Sensors, { global: { stubs: { RouterLink: true } } });
    expect(wrapper.text()).toContain('*****');
    expect(wrapper.text()).not.toContain('private-value');
    expect(wrapper.text()).toContain('42');
    wrapper.unmount();
  });
});

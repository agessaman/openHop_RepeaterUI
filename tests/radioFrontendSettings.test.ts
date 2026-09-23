/**
 * RF Front End card (KISS modem AGC reset interval / FEM gain).
 *
 * These controls apply to the modem live, so the card must show what the modem
 * runs, send only what changed, and surface a partial failure rather than "OK".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RadioFrontendSettings from '@/components/configuration/RadioFrontendSettings.vue';
import RadioHardwareSettings from '@/components/configuration/RadioHardwareSettings.vue';
import { useSetupStore } from '@/stores/setup';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

const apiMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getSerialPorts: vi.fn().mockResolvedValue({ success: true, data: [] }),
  importConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getRadioFrontend: vi.fn(),
  setRadioFrontend: vi.fn(),
}));

vi.mock('@/utils/api', () => ({
  default: apiMock,
  ApiService: apiMock,
  API_SERVER_URL: '',
  apiClient: {},
}));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn().mockResolvedValue(true),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

function status(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    supports: { agc_reset_interval_seconds: true, fem_rx_gain: true, fem_tx_gain: false },
    running: { agc_reset_interval_seconds: 30, fem_rx_gain: false },
    configured: {},
    ...overrides,
  };
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(RadioFrontendSettings, { props });
}

async function clickTestId(wrapper: ReturnType<typeof mount>, id: string) {
  await wrapper.get(`[data-testid="${id}"]`).trigger('click');
  await flushPromises();
}

describe('RadioFrontendSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the default radio is not a KISS modem', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(false);
  });

  it('explains an old firmware / board with no controls', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({
        supports: { agc_reset_interval_seconds: false, fem_rx_gain: false, fem_tx_gain: false },
        running: {},
      }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="frontend-none"]').text()).toContain('KISS firmware v2');
    expect(wrapper.find('[data-testid="frontend-edit"]').exists()).toBe(false);
  });

  it('shows running values, board defaults, and unsupported controls', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ configured: { agc_reset_interval_seconds: 30 } }),
    });
    const wrapper = mountCard({ defaultRadioId: 'local' });
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toBe('30 s');
    expect(wrapper.get('[data-testid="frontend-fem_rx_gain"]').text()).toBe('Off (board default)');
    expect(wrapper.get('[data-testid="frontend-fem_tx_gain"]').text()).toBe(
      'Not available on this board',
    );
    expect(wrapper.text()).toContain('default radio (local) only');
  });

  it('sends only changed settings and reports rounding', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: {
        ...status({
          running: { agc_reset_interval_seconds: 8, fem_rx_gain: false },
          configured: { agc_reset_interval_seconds: 8 },
        }),
        applied: { agc_reset_interval_seconds: 8 },
        errors: {},
      },
    });
    const wrapper = mountCard();
    await flushPromises();
    await clickTestId(wrapper, 'frontend-edit');
    await wrapper.get('[data-testid="frontend-agc-input"]').setValue(10);
    await clickTestId(wrapper, 'frontend-save');

    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({ agc_reset_interval_seconds: 10 });
    expect(wrapper.text()).toContain('rounded to 8 s');
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toBe('8 s');
  });

  it('sends a FEM change', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status(), applied: { fem_rx_gain: true }, errors: {} },
    });
    const wrapper = mountCard();
    await flushPromises();
    await clickTestId(wrapper, 'frontend-edit');
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    await clickTestId(wrapper, 'frontend-save');
    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({ fem_rx_gain: true });
  });

  it('does not call the API when nothing changed', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await clickTestId(wrapper, 'frontend-edit');
    await clickTestId(wrapper, 'frontend-save');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="frontend-edit"]').exists()).toBe(true);
  });

  it('rejects an out-of-range interval before sending', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await clickTestId(wrapper, 'frontend-edit');
    await wrapper.get('[data-testid="frontend-agc-input"]').setValue(2000);
    await clickTestId(wrapper, 'frontend-save');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('0-1020');
  });

  it('surfaces a partial failure and keeps editing', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied (fem_rx_gain: radio did not apply setting)',
      data: { ...status(), applied: {}, errors: { fem_rx_gain: 'radio did not apply setting' } },
    });
    const wrapper = mountCard();
    await flushPromises();
    await clickTestId(wrapper, 'frontend-edit');
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    await clickTestId(wrapper, 'frontend-save');
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('fem_rx_gain');
    expect(wrapper.find('[data-testid="frontend-save"]').exists()).toBe(true);
  });
});

describe('RadioHardwareSettings KISS entry save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
  });

  it('keeps a KISS radio’s tuning and front-end keys when its port is edited', async () => {
    const AIR = {
      frequency: 869618000,
      bandwidth: 62500,
      spreading_factor: 8,
      coding_rate: 8,
      tx_power: 14,
      preamble_length: 32,
    };
    const kiss = {
      port: '/dev/ttyACM0',
      baud_rate: 115200,
      kiss_persistence: 255,
      agc_reset_interval_seconds: 4,
      fem_rx_gain: true,
    };
    const config = {
      radio_type: 'kiss',
      radio: { ...AIR },
      kiss: { ...kiss },
      radios: [
        { id: 'local', radio_type: 'kiss', radio: { ...AIR }, kiss: { ...kiss } },
        {
          id: 'link',
          radio_type: 'kiss',
          radio: { ...AIR },
          kiss: { port: '/dev/ttyACM1', baud_rate: 115200 },
        },
      ],
      fabric: { default_radio: 'local', tx_mode: 'bridge' },
    };
    const pinia = createPinia();
    setActivePinia(pinia);
    const systemStore = useSystemStore();
    systemStore.stats = { config } as never;
    vi.spyOn(systemStore, 'fetchStats').mockResolvedValue({ config } as never);
    vi.spyOn(useSetupStore(), 'fetchRadioPresets').mockResolvedValue(undefined);
    const wrapper = mount(RadioHardwareSettings, {
      global: { plugins: [pinia], stubs: { RestartModal: true, UnsavedChangesModal: true } },
    });
    await flushPromises();

    const button = (text: string) =>
      wrapper.findAll('button').find((b) => b.text().includes(text))!;
    await button('Edit Settings').trigger('click');
    await flushPromises();
    await button('Save Changes').trigger('click');
    await flushPromises();

    const calls = (ApiService.importConfig as ReturnType<typeof vi.fn>).mock.calls;
    const body = calls[calls.length - 1][0];
    const local = body.radios.find((r: { id: string }) => r.id === 'local');
    expect(local.kiss).toMatchObject({
      kiss_persistence: 255,
      agc_reset_interval_seconds: 4,
      fem_rx_gain: true,
    });
  });
});

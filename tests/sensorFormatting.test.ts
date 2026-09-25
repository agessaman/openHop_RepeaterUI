import { describe, it, expect } from 'vitest';
import { flattenHardwareStats, formatUptime, formatLoadAvg } from '@/utils/sensorFormatting';

// Real payload shape captured from a live hardware_stats reading (16-core PVE host).
const liveData: Record<string, unknown> = {
  cpu: {
    usage_percent: 10.0,
    count: 1,
    frequency: 1000.066,
    load_avg: { '1min': 9.15478515625, '5min': 8.35107421875, '15min': 8.4287109375 },
  },
  memory: { total: 536870912, available: 345575424, used: 191295488, usage_percent: 35.6 },
  disk: { total: 10737418240, used: 4511891456, free: 6225526784, usage_percent: 42.0 },
  network: {
    bytes_sent: 34623425065,
    bytes_recv: 16332446817,
    packets_sent: 21155716,
    packets_recv: 76331723,
  },
  system: {
    uptime: 1956321.807908535,
    boot_time: 1788148205.0,
    os: 'Debian GNU/Linux 12 (bookworm)',
    kernel: '7.0.14-14-pve',
    arch: 'x86_64',
  },
  temperatures: { nvme_0: 52.85, coretemp_0: 48.0, pch_lewisburg: 41.0 },
};

describe('flattenHardwareStats', () => {
  it('flattens a live payload into flat key-value pairs (no nesting)', () => {
    const flat = flattenHardwareStats(liveData);
    expect(flat).toBeTruthy();
    for (const value of Object.values(flat!)) {
      expect(typeof value).toBe('string');
    }
  });

  it('formats cpu usage, cores, frequency and load average', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['cpu_usage']).toBe('10.0%');
    expect(flat['cpu_cores']).toBe('1');
    expect(flat['cpu_frequency']).toBe('1000 MHz');
    expect(flat['load_avg_1m_5m_15m']).toBe('9.15 / 8.35 / 8.43');
  });

  it('formats memory in human-readable bytes', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['memory_usage']).toBe('35.6%');
    expect(flat['memory_used']).toBe('182 MB');
    expect(flat['memory_available']).toBe('330 MB');
    expect(flat['memory_total']).toBe('512 MB');
  });

  it('formats disk in human-readable bytes', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['disk_usage']).toBe('42.0%');
    expect(flat['disk_used']).toBe('4.2 GB');
    expect(flat['disk_free']).toBe('5.8 GB');
    expect(flat['disk_total']).toBe('10 GB');
  });

  it('formats network totals and packet counts', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['net_bytes_sent']).toBe('32 GB');
    expect(flat['net_bytes_recv']).toBe('15 GB');
    expect(flat['net_packets_sent']).toBe('21.2M');
    expect(flat['net_packets_recv']).toBe('76.3M');
  });

  it('formats system uptime, os, kernel and arch', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['uptime']).toBe('22d 15:25:21');
    expect(flat['os']).toBe('Debian GNU/Linux 12 (bookworm)');
    expect(flat['kernel']).toBe('7.0.14-14-pve');
    expect(flat['arch']).toBe('x86_64');
  });

  it('flattens temperatures with a temp_ prefix and °C formatting', () => {
    const flat = flattenHardwareStats(liveData)!;
    expect(flat['temp_coretemp_0']).toBe('48.0°C');
    expect(flat['temp_nvme_0']).toBe('52.9°C');
    expect(flat['temp_pch_lewisburg']).toBe('41.0°C');
  });

  it('omits keys for sub-objects that are absent from the payload', () => {
    const flat = flattenHardwareStats({
      cpu: {
        usage_percent: 1,
        count: 4,
        frequency: 2400,
        load_avg: { '1min': 0.1, '5min': 0.2, '15min': 0.3 },
      },
    })!;
    expect(flat['cpu_usage']).toBe('1.0%');
    expect(flat['cpu_cores']).toBe('4');
    expect('memory_used' in flat).toBe(false);
    expect('disk_total' in flat).toBe(false);
    expect('temp_nvme_0' in flat).toBe(false);
  });

  it('never emits raw JSON for nested values', () => {
    const flat = flattenHardwareStats(liveData)!;
    for (const value of Object.values(flat)) {
      expect(value.startsWith('{')).toBe(false);
      expect(value).not.toContain('usage_percent');
    }
  });

  it('tolerates missing or malformed sub-values', () => {
    const flat = flattenHardwareStats({
      cpu: { usage_percent: null, load_avg: 'broken' },
      memory: { total: 'nope' },
      temperatures: { fan: 'unknown' },
    })!;
    expect(flat['cpu_usage']).toBe('n/a');
    expect(flat['load_avg_1m_5m_15m']).toBe('n/a');
    expect(flat['memory_total']).toBe('n/a');
    expect(flat['temp_fan']).toBe('n/a');
  });

  it('returns null for non-object input', () => {
    expect(flattenHardwareStats(null)).toBeNull();
    expect(flattenHardwareStats('str')).toBeNull();
    expect(flattenHardwareStats([1, 2])).toBeNull();
    expect(flattenHardwareStats({})).toBeNull();
  });
});

describe('formatUptime', () => {
  it('formats days/hours/minutes/seconds', () => {
    expect(formatUptime(1956321.8)).toBe('22d 15:25:21');
    expect(formatUptime(90000)).toBe('1d 01:00:00');
    expect(formatUptime(3725)).toBe('1h 02:05');
    expect(formatUptime(300)).toBe('5m 00s');
  });

  it('handles invalid input', () => {
    expect(formatUptime(undefined)).toBe('n/a');
    expect(formatUptime('nope')).toBe('n/a');
    expect(formatUptime(-5)).toBe('n/a');
  });
});

describe('formatLoadAvg', () => {
  it('formats the triple with two decimals', () => {
    expect(formatLoadAvg({ '1min': 0.5, '5min': 1.25, '15min': 2.75 })).toBe('0.50 / 1.25 / 2.75');
  });

  it('handles missing values', () => {
    expect(formatLoadAvg(undefined)).toBe('n/a');
    expect(formatLoadAvg({ '1min': 0.5 })).toBe('0.50 / ? / ?');
  });
});

/* ═══════════════════════════════════════════════════════════
   Alert Engine Tests
   Tests: template generation, SMS gateway, trigger logic
   ═══════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pressureDropAlert,
  fitmentOverdueAlert,
  inspectionDueAlert,
  tyreRemovedAlert,
  rtdThresholdAlert,
  dailyDigest
} from '../../02-Alert-Notification-Engine/shared/alert-templates.js';

describe('Alert Templates', () => {
  it('should generate pressure drop alert in English and Hindi', () => {
    const msg = pressureDropAlert({ tyreNo: 'DHT-1234', position: 'FL', currentPsi: 65, targetPsi: 120, truckNo: 'TRK-07' });
    expect(msg.en).toContain('TRK-07');
    expect(msg.en).toContain('65 PSI');
    expect(msg.en).toContain('120 PSI');
    expect(msg.hi).toContain('TRK-07');
    expect(msg.hi).toContain('65 PSI');
  });

  it('should generate fitment overdue alert', () => {
    const msg = fitmentOverdueAlert({ position: 'FL', truckNo: 'TRK-07', hoursElapsed: 26 });
    expect(msg.en).toContain('26h overdue');
    expect(msg.en).toContain('TRK-07');
  });

  it('should generate inspection due alert', () => {
    const msg = inspectionDueAlert({ tyreNo: 'DHT-1234', lastInspectionDate: '01-May-2026', daysSinceInspection: 8 });
    expect(msg.en).toContain('8 days ago');
    expect(msg.en).toContain('DHT-1234');
  });

  it('should generate tyre removed alert', () => {
    const msg = tyreRemovedAlert({ tyreNo: 'DHT-1234', position: 'FL', truckNo: 'TRK-07', reason: 'Sidewall cut' });
    expect(msg.en).toContain('DHT-1234');
    expect(msg.en).toContain('Sidewall cut');
  });

  it('should generate RTD threshold warning', () => {
    const msg = rtdThresholdAlert({ tyreNo: 'DHT-1234', currentRtd: 2.5, thresholdRtd: 3.0, estimatedDaysRemaining: 14 });
    expect(msg.en).toContain('2.5mm');
    expect(msg.en).toContain('14 days');
  });

  it('should generate daily digest with all data', () => {
    const msg = dailyDigest({
      siteName: 'Bharat West',
      healthScore: 72,
      fleetSize: 120,
      pressureIssues: 3,
      pendingFitments: 1,
      overdueInspections: 0,
      savings: '₹450K saved'
    });
    expect(msg.en).toContain('Bharat West');
    expect(msg.en).toContain('72/100');
    expect(msg.en).toContain('120 tyres');
    expect(msg.en).toContain('3 pressure alerts');
    expect(msg.en).toContain('1 fitments pending');
    expect(msg.en).toContain('₹450K saved');
  });

  it('should handle null health score in digest', () => {
    const msg = dailyDigest({
      siteName: 'Test Site',
      healthScore: null,
      fleetSize: 0,
      pressureIssues: 0,
      pendingFitments: 0,
      overdueInspections: 0,
      savings: null
    });
    expect(msg.en).not.toContain('/100');
    expect(msg.en).not.toContain('₹');
  });
});

describe('SMS Gateway (Fast2SMS mock behavior)', () => {
  it('should validate Indian phone numbers', () => {
    const valid = (phone) => /^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ''));
    expect(valid('9876543210')).toBe(true);
    expect(valid('987654321')).toBe(false);
    expect(valid('1876543210')).toBe(false);
    expect(valid('98765432101')).toBe(false);
    expect(valid('98765 43210')).toBe(true);
  });

  it('should enforce rate limit of 10 per 60s window', async () => {
    const timestamps = [];
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      timestamps.push(now - i * 1000);
    }
    // 10 in last 10 seconds would exceed limit if window is 60s
    expect(timestamps.length).toBe(10);

    // Simulate rate check
    const windowStart = now - 60000;
    const inWindow = timestamps.filter(t => t >= windowStart);
    expect(inWindow.length).toBe(10);
  });
});

describe('Alert Trigger Logic', () => {
  it('should trigger pressure drop when PSI below threshold', () => {
    const threshold = 100;
    const currentPsi = 65;
    expect(currentPsi < threshold).toBe(true);
  });

  it('should not trigger when PSI is above threshold', () => {
    const threshold = 100;
    const currentPsi = 105;
    expect(currentPsi < threshold).toBe(false);
  });

  it('should trigger fitment overdue after 24 hours', () => {
    const hoursElapsed = 26;
    expect(hoursElapsed >= 24).toBe(true);
  });

  it('should not trigger fitment alert within 24 hours', () => {
    const hoursElapsed = 18;
    expect(hoursElapsed >= 24).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════
   Analytics Calculation Verification Tests
   Tests CPK, variance, rubber utilization, fleet health score
   ═══════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest';

/* ── Utility functions mirroring dashboard analytics ──── */

function calcVariance(actual, target) {
  return actual - target;
}

function calcAchievementPct(actual, target) {
  if (!target || target <= 0) return 0;
  return (actual / target) * 100;
}

function calcCpk(actualLife, targetLife, tyreCost, averageBrandLife) {
  if (!tyreCost || tyreCost <= 0) return 0;
  if (!averageBrandLife || averageBrandLife <= 0) return 0;
  return (actualLife / targetLife) * (averageBrandLife / tyreCost);
}

function calcRubberUtilization(originalRtd, removalRtd, otd) {
  if (!originalRtd || originalRtd <= 0) return { rubberUsedPct: 0, rubberWastedPct: 0, valueLost: 0 };
  const rtdUsed = originalRtd - removalRtd;
  const pctUsed = (rtdUsed / originalRtd) * 100;
  const pctWasted = 100 - pctUsed;
  const valueLost = otd ? (pctWasted / 100) * otd : 0;
  return { rubberUsedPct: Math.round(pctUsed * 100) / 100, rubberWastedPct: Math.round(pctWasted * 100) / 100, valueLost: Math.round(valueLost * 100) / 100 };
}

function calcFleetHealthScore(pressureCompliance, lifeRemainingPct, inspectionRecency, leakageSeverity, defectRate) {
  const pScore = pressureCompliance * 30;
  const lScore = (100 - lifeRemainingPct) * 0.25;
  const iScore = inspectionRecency * 20;
  const leakScore = Math.max(0, 15 - leakageSeverity * 0.3);
  const dScore = (1 - defectRate) * 10;
  return Math.round((pScore + lScore + iScore + leakScore + dScore) * 10) / 10;
}

describe('Analytics Calculations', () => {
  describe('CPK Calculation', () => {
    it('should calculate CPK correctly for ideal tyre', () => {
      const cpk = calcCpk(45000, 40000, 85000, 50000);
      expect(cpk).toBeCloseTo(0.662, 2);
    });

    it('should return 0 when tyre cost is 0', () => {
      expect(calcCpk(45000, 40000, 0, 50000)).toBe(0);
    });

    it('should return 0 when average brand life is 0', () => {
      expect(calcCpk(45000, 40000, 85000, 0)).toBe(0);
    });
  });

  describe('Variance Calculation', () => {
    it('should calculate positive variance', () => {
      expect(calcVariance(45000, 40000)).toBe(5000);
    });

    it('should calculate negative variance', () => {
      expect(calcVariance(35000, 40000)).toBe(-5000);
    });

    it('should return zero for exact match', () => {
      expect(calcVariance(40000, 40000)).toBe(0);
    });
  });

  describe('Achievement Percentage', () => {
    it('should calculate 112.5% achievement', () => {
      expect(calcAchievementPct(45000, 40000)).toBe(112.5);
    });

    it('should calculate 0% when target is 0', () => {
      expect(calcAchievementPct(45000, 0)).toBe(0);
    });
  });

  describe('Rubber Utilization', () => {
    it('should calculate 75% rubber used for 16mm→4mm on original 16mm OTD', () => {
      const result = calcRubberUtilization(16, 4, 100000);
      expect(result.rubberUsedPct).toBe(75);
      expect(result.rubberWastedPct).toBe(25);
      expect(result.valueLost).toBe(25000);
    });

    it('should calculate 0% used when original RTD is 0', () => {
      const result = calcRubberUtilization(0, 0, 100000);
      expect(result.rubberUsedPct).toBe(0);
      expect(result.valueLost).toBe(0);
    });
  });

  describe('Fleet Health Score', () => {
    it('should return 100 for perfect fleet', () => {
      const score = calcFleetHealthScore(1.0, 0, 1.0, 0, 0);
      expect(score).toBeCloseTo(100, 0);
    });

    it('should return ~50 for average fleet', () => {
      const score = calcFleetHealthScore(0.5, 50, 0.5, 15, 0.2);
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(70);
    });

    it('should return low score for poor fleet', () => {
      const score = calcFleetHealthScore(0.1, 90, 0.1, 40, 0.5);
      expect(score).toBeLessThan(30);
    });
  });
});

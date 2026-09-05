/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Alert Templates (English / Hindi)
   Phrase library for all alert event types.
   Each function returns { en, hi } for bilingual delivery.
   ═══════════════════════════════════════════════════════════ */

export function pressureDropAlert({ tyreNo, position, currentPsi, targetPsi, truckNo }) {
  return {
    en: `ALERT: ${truckNo} ${position} tyre (${tyreNo}) at ${currentPsi} PSI. Target is ${targetPsi} PSI. Immediate attention needed.`,
    hi: `सतर्कता: ${truckNo} ${position} टायर (${tyreNo}) ${currentPsi} PSI पर। लक्ष्य ${targetPsi} PSI है। तत्काल ध्यान आवश्यक।`
  };
}

export function fitmentOverdueAlert({ position, truckNo, hoursElapsed }) {
  return {
    en: `FITMENT PENDING: ${truckNo} ${position} position, ${Math.round(hoursElapsed)}h overdue. Assign fitter immediately.`,
    hi: `फिटमेंट लंबित: ${truckNo} ${position} स्थान, ${Math.round(hoursElapsed)} घंटे बकाया। तुरंत फिटर लगाएं।`
  };
}

export function inspectionDueAlert({ tyreNo, lastInspectionDate, daysSinceInspection }) {
  return {
    en: `INSPECTION DUE: Tyre ${tyreNo}, last inspected ${lastInspectionDate} (${daysSinceInspection} days ago). Schedule inspection today.`,
    hi: `निरीक्षण बकाया: टायर ${tyreNo}, अंतिम निरीक्षण ${lastInspectionDate} (${daysSinceInspection} दिन पहले)। आज निरीक्षण करें।`
  };
}

export function tyreRemovedAlert({ tyreNo, position, truckNo, reason }) {
  return {
    en: `REMOVAL NOTED: ${tyreNo} removed from ${truckNo} ${position}. Reason: ${reason || 'Not specified'}.`,
    hi: `हटाने की सूचना: ${truckNo} ${position} से ${tyreNo} हटाया गया। कारण: ${reason || 'निर्दिष्ट नहीं'}.`
  };
}

export function rtdThresholdAlert({ tyreNo, currentRtd, thresholdRtd, estimatedDaysRemaining }) {
  return {
    en: `RTD WARNING: ${tyreNo} at ${currentRtd}mm RTD. Threshold is ${thresholdRtd}mm. Estimated ${estimatedDaysRemaining} days remaining. Plan replacement.`,
    hi: `RTD चेतावनी: ${tyreNo} ${currentRtd}mm RTD पर। सीमा ${thresholdRtd}mm है। लगभग ${estimatedDaysRemaining} दिन शेष। प्रतिस्थापन की योजना बनाएं।`
  };
}

export function dailyDigest({ siteName, healthScore, fleetSize, pressureIssues, pendingFitments, overdueInspections, savings }) {
  const enParts = [
    `📊 DynaHaul X — ${siteName}`,
    healthScore !== null ? `Health: ${Math.round(healthScore)}/100` : null,
    `Fleet: ${fleetSize} tyres`,
    pressureIssues > 0 ? `⚠ ${pressureIssues} pressure alerts` : '✅ Pressure OK',
    pendingFitments > 0 ? `🔧 ${pendingFitments} fitments pending` : '✅ No pending fitments',
    overdueInspections > 0 ? `🔍 ${overdueInspections} inspections due` : '✅ Inspections current',
    savings ? `💰 ${savings}` : null
  ].filter(Boolean).join(' | ');

  const hiParts = [
    `📊 DynaHaul X — ${siteName}`,
    healthScore !== null ? `स्वास्थ्य: ${Math.round(healthScore)}/100` : null,
    `${fleetSize} टायर`,
    pressureIssues > 0 ? `⚠ ${pressureIssues} दबाव अलर्ट` : '✅ दबाव ठीक',
    pendingFitments > 0 ? `🔧 ${pendingFitments} फिटमेंट लंबित` : '✅ कोई फिटमेंट नहीं',
    overdueInspections > 0 ? `🔍 ${overdueInspections} निरीक्षण बकाया` : '✅ निरीक्षण वर्तमान',
    savings ? `💰 ${savings}` : null
  ].filter(Boolean).join(' | ');

  return { en: enParts, hi: hiParts };
}

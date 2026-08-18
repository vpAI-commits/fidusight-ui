// TNP = (amt_paid_pharmacy + bfsf_admin_fee) - rebate_passed_thru
export function calculateTNP(
  pharmacyReimbursement: number,
  bfsfAdminFee: number,
  rebatePassedThru: number
): number {
  return pharmacyReimbursement + bfsfAdminFee - rebatePassedThru;
}

// Standardized 30-Day True Net Price
// TNP_30 = ((amt_paid_pharmacy + bfsf_admin_fee - rebate_passed_thru) / days_supply) * 30.0
export function calculateTNP30(
  pharmacyReimbursement: number,
  bfsfAdminFee: number,
  rebatePassedThru: number,
  daysSupply: number
): number {
  if (daysSupply === 0) return 0;
  return (calculateTNP(pharmacyReimbursement, bfsfAdminFee, rebatePassedThru) / daysSupply) * 30.0;
}

// Unit Metric Cost (for injections / liquids)
export function calculateTNPPerUnit(
  pharmacyReimbursement: number,
  bfsfAdminFee: number,
  rebatePassedThru: number,
  quantityDispensed: number
): number {
  if (quantityDispensed === 0) return 0;
  return calculateTNP(pharmacyReimbursement, bfsfAdminFee, rebatePassedThru) / quantityDispensed;
}

// Spread = amt_billed_plan - amt_paid_pharmacy
export function calculateSpread(amtBilledPlan: number, amtPaidPharmacy: number): number {
  return amtBilledPlan - amtPaidPharmacy;
}

export interface ArbitrageResult {
  grossDifferential: number;
  adminFeeDifferential: number;
  rebateDifferential: number;
  netAnnualSavings: number;
  totalClaims: number;
  currentAnnualSpend: number;
  simulatedAnnualSpend: number;
}

// Simulate carving out a therapeutic class from PBM A to PBM B
export function simulateCarveOut(
  claims: Array<{
    pharmacy_reimbursement: number;
    bfsf_admin_fee: number;
    rebate_passed_thru: number;
    claim_count: number;
  }>,
  targetPBM: {
    pharmacy_reimbursement: number;
    bfsf_admin_fee: number;
    rebate_passed_thru: number;
  }
): ArbitrageResult {
  const totalClaims = claims.reduce((sum, c) => sum + c.claim_count, 0);

  // Current spend on PBM A
  const currentAnnualSpend = claims.reduce(
    (sum, c) => sum + (c.pharmacy_reimbursement + c.bfsf_admin_fee - c.rebate_passed_thru) * c.claim_count,
    0
  );

  // Simulated spend on PBM B (re-adjudicate all claims against target PBM unit pricing)
  const targetTNP = targetPBM.pharmacy_reimbursement + targetPBM.bfsf_admin_fee - targetPBM.rebate_passed_thru;
  const simulatedAnnualSpend = targetTNP * totalClaims;

  const netAnnualSavings = currentAnnualSpend - simulatedAnnualSpend;

  const grossDifferential = claims.reduce(
    (sum, c) => sum + (c.pharmacy_reimbursement - targetPBM.pharmacy_reimbursement) * c.claim_count,
    0
  );
  const adminFeeDifferential = claims.reduce(
    (sum, c) => sum + (c.bfsf_admin_fee - targetPBM.bfsf_admin_fee) * c.claim_count,
    0
  );
  const rebateDifferential = claims.reduce(
    (sum, c) => sum + (targetPBM.rebate_passed_thru - c.rebate_passed_thru) * c.claim_count,
    0
  );

  return {
    grossDifferential,
    adminFeeDifferential,
    rebateDifferential,
    netAnnualSavings,
    totalClaims,
    currentAnnualSpend,
    simulatedAnnualSpend,
  };
}

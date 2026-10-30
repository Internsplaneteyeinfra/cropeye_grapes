# Drip Irrigation Water Required Formula

## 📊 Formula Used in IrrigationSchedule.tsx

### Step 1: Calculate Net ET (Evapotranspiration)
```typescript
const calculateNetET = (et: number, rainfall: number) => {
  const net = Number(et) - Number(rainfall);
  return net > 0 ? net : 0;  // Net ET cannot be negative
}
```

**Formula:**
```
Net ET (mm/day) = ET (mm/day) - Rainfall (mm/day)
```

---

### Step 2: Calculate Water Required (Liters per Acre)

```typescript
const waterFromNetET = (netEt: number, kcVal: number) => {
  if (!Number.isFinite(netEt) || !Number.isFinite(kcVal) || netEt <= 0) return 0;
  const liters = netEt * kcVal * 0.94 * 4046.86;
  return Math.round(liters);
}
```

**Formula:**
```
Water Required (Liters/Acre) = Net ET × Kc × Efficiency Factor × Area Conversion Factor
```

**Where:**
- **Net ET** = Evapotranspiration - Rainfall (in mm/day)
- **Kc** = Crop Coefficient (varies by crop growth stage: 0.3 to 1.2)
- **0.94** = Irrigation Efficiency Factor (94% efficiency for drip irrigation)
- **4046.86** = Conversion Factor (1 acre = 4046.86 square meters)

**Simplified Formula:**
```
Water Required (Liters/Acre) = Net ET × Kc × 0.94 × 4046.86
```

---

### Step 3: Calculate Drip Irrigation Time

```typescript
if (irrigationTypeCode === "drip") {
  if (!flowRateLph || flowRateLph <= 0 || !emittersCount || emittersCount <= 0 || !totalPlants || totalPlants <= 0)
    return "N/A";

  const timeInMinutes = ((waterRequired * 60) / (43560/spacingA*spacingB) * (emittersCount * flowRateLph));
  const hours = timeInMinutes / 60;
  return formatTimeHrsMins(hours);
}
```

**Note:** The drip irrigation time formula appears to have a calculation issue. The correct formula should be:

```
Time (hours) = Water Required (Liters) / Total Flow Rate (Liters/hour)

Where:
Total Flow Rate = Number of Emitters × Flow Rate per Emitter (LPH)
```

---

## 📝 Complete Code Example

```typescript
// Step 1: Calculate Net ET
const calculateNetET = (et: number, rainfall: number) => {
  const net = Number(et) - Number(rainfall);
  return net > 0 ? net : 0;
};

// Step 2: Calculate Water Required from Net ET
const waterFromNetET = (netEt: number, kcVal: number) => {
  if (!Number.isFinite(netEt) || !Number.isFinite(kcVal) || netEt <= 0) return 0;

  // Formula: Net ET × Kc × Efficiency × Area Conversion
  const liters = netEt * kcVal * 0.94 * 4046.86;
  return Math.round(liters);
};

// Step 3: Usage in schedule generation
const generateScheduleData = () => {
  // ... code ...

  const netEt = calculateNetET(etForDay, rainfall);
  const waterRequired = waterFromNetET(netEt, kc);  // Water required in Liters/Acre
  const time = calcIrrigationTime(waterRequired);

  // ... rest of code ...
};
```

---

## 🔢 Formula Breakdown

### Constants Used:
- **0.94** = Drip Irrigation Efficiency (94%)
  - Accounts for water loss due to evaporation, deep percolation, etc.

- **4046.86** = Square meters per acre
  - 1 acre = 4046.86 m²
  - Used to convert mm/day to liters/acre
  - Conversion: 1 mm/day over 1 acre = 4046.86 liters/day

### Variables:
- **ET (mm/day)**: Evapotranspiration rate from API
- **Rainfall (mm/day)**: Current or forecasted rainfall
- **Kc**: Crop coefficient (from bud.json based on crop stage)
  - Germination: ~0.3
  - Tillering: ~0.6-0.8
  - Grand Growth: ~1.0-1.2
  - Maturity: ~0.8-0.9

---

## 📐 Mathematical Explanation

**Step-by-step conversion:**
1. Net ET = ET - Rainfall (mm/day)
2. Crop Water Requirement = Net ET × Kc (mm/day)
3. With Efficiency: Effective Water Need = Crop Water Requirement / Efficiency
   - Effective Water Need = (Net ET × Kc) / 0.94
4. Convert to Volume per Acre:
   - 1 mm = 0.001 m
   - Area = 1 acre = 4046.86 m²
   - Volume = (Net ET × Kc / 0.94) × 0.001 m × 4046.86 m²
   - Volume = Net ET × Kc × 0.94 × 4046.86 liters

**Final Formula:**
```
Water Required (Liters/Acre) = Net ET (mm/day) × Kc × 0.94 × 4046.86
```

---

## 💡 Example Calculation

**Given:**
- ET = 4.5 mm/day
- Rainfall = 0 mm
- Kc = 0.8 (Tillering stage)
- Efficiency = 94% (0.94)

**Calculation:**
1. Net ET = 4.5 - 0 = 4.5 mm/day
2. Water Required = 4.5 × 0.8 × 0.94 × 4046.86
3. Water Required = 13,687.5 liters/acre/day

**Rounded:** 13,688 liters/acre/day

---

## ⚠️ Note on Drip Irrigation Time Calculation

The current drip irrigation time formula (line 76) appears incorrect:

```typescript
// Current (seems incorrect):
const timeInMinutes = ((waterRequired * 60) / (43560/spacingA*spacingB) * (emittersCount * flowRateLph));

// Suggested correction:
const totalFlowRate = emittersCount * flowRateLph; // Total flow in L/hour
const timeInHours = waterRequired / totalFlowRate; // Time in hours
const timeInMinutes = timeInHours * 60;
```

**Correct Formula:**
```
Irrigation Time (hours) = Water Required (Liters) / (Number of Emitters × Flow Rate per Emitter (LPH))
```

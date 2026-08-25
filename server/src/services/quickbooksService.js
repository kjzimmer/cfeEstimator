// Simulated QuickBooks Online integration -- stands in for a real API
// connection until QB OAuth/API access is set up. Per the design decision:
// QuickBooks syncs INTO the existing rate-card tables; the agent and UI
// never call out to QB directly, so this is the ONLY place a real
// integration needs to replace fetchRateItems()'s body -- everything
// downstream (rateCardService.syncFromQuickBooks, the sync route, the UI)
// only ever sees the same { category, name, unit, rate, cost } shape a
// rate-card row already has.
//
// A real integration will also need to decide where `cost` comes from --
// QBO service items primarily carry a sales price (UnitPrice), not
// necessarily a clean internal-cost figure the way this app uses `cost`
// for margin tracking. Not resolved here; the mock just includes plausible
// cost figures so the simulation exercises the full rate-card shape.

const MOCK_QUICKBOOKS_ITEMS = [
  // service_rates -- two updates to existing seeded rows, two new items
  { category: 'service_rates', name: 'Excavation - Standard Dig', unit: 'hr', rate: 190, cost: 115 },
  { category: 'service_rates', name: 'Demolition', unit: 'hr', rate: 195, cost: 120 },
  { category: 'service_rates', name: 'Land Clearing', unit: 'acre', rate: 2250, cost: 1450 },
  { category: 'service_rates', name: 'Asbestos Handling & Disposal', unit: 'job', rate: 3000, cost: 1800 },

  // material_costs
  { category: 'material_costs', name: 'Crushed Stone (3/4")', unit: 'ton', rate: 42, cost: 28 },
  { category: 'material_costs', name: 'Rip Rap', unit: 'ton', rate: 50, cost: 34 },
  { category: 'material_costs', name: 'Geotextile Fabric', unit: 'sq yd', rate: 1.85, cost: 1.1 },

  // equipment_rates -- includes the resource description style from real
  // CFE estimates referenced in task-resource-pipeline.md (EST-2026-0079/80)
  { category: 'equipment_rates', name: 'Mini Excavator (Cat 305)', unit: 'day', rate: 650, cost: 420 },
  { category: 'equipment_rates', name: 'Standard Excavator (Cat 320)', unit: 'day', rate: 975, cost: 655 },
  { category: 'equipment_rates', name: 'Excavator w/ Hydraulic Thumb (320-class)', unit: 'day', rate: 1050, cost: 700 },

  // employee_role_rates
  { category: 'employee_role_rates', name: 'Laborer', unit: 'hr', rate: 55, cost: 32 },
  { category: 'employee_role_rates', name: 'Equipment Operator', unit: 'hr', rate: 88, cost: 54 },
  { category: 'employee_role_rates', name: 'Certified Asbestos Handler', unit: 'hr', rate: 95, cost: 60 },
];

export async function fetchRateItems() {
  return MOCK_QUICKBOOKS_ITEMS;
}

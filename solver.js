const solver = require('javascript-lp-solver');

function optimizeSchedule(scenarioData, directives) {
  let model = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {}
  };

  const hours = 24;
  const initialEnergy = scenarioData.battery.initial_energy_kwh;
  const capacity = scenarioData.battery.capacity_kwh;
  const maxChargeRate = scenarioData.battery.max_charge_kw;
  const maxDischargeRate = scenarioData.battery.max_discharge_kw;

  // Force end-of-day neutrality constraint[cite: 7]
  model.constraints['end_of_day_energy'] = { equal: initialEnergy };

  // Loop through hours 0-23 to build standard constraints[cite: 7]
  for (let i = 0; i < hours; i++) {
    const gridImport = `grid_import_${i}`;
    const charge = `charge_${i}`;
    const discharge = `discharge_${i}`;
    const energyState = `energy_state_${i}`;

    // Initialize variables with grid cost
    model.variables[gridImport] = { cost: scenarioData.grid_rates_bdt[i] };
    model.variables[charge] = { cost: 0 };
    model.variables[discharge] = { cost: 0 };
    model.variables[energyState] = { cost: 0 };

    // 1. Energy balance: grid + solar + discharge = demand + charge[cite: 7]
    // Rearranged for solver: grid - charge + discharge = demand - solar
    const demand = scenarioData.demand_kwh[i];
    const solar = scenarioData.solar_forecast_kwh[i];
    
    model.constraints[`balance_${i}`] = { equal: demand - solar };
    model.variables[gridImport][`balance_${i}`] = 1;
    model.variables[charge][`balance_${i}`] = -1;
    model.variables[discharge][`balance_${i}`] = 1;

    // 2. Battery state tracking
    // energy_state_i - charge_i + discharge_i - energy_state_{i-1} = 0
    model.constraints[`state_tracking_${i}`] = { equal: 0 };
    model.variables[energyState][`state_tracking_${i}`] = 1;
    model.variables[charge][`state_tracking_${i}`] = -1;
    model.variables[discharge][`state_tracking_${i}`] = 1;
    
    if (i === 0) {
       // First hour accounts for the initial battery energy
       model.constraints[`state_tracking_${i}`].equal = initialEnergy; 
    } else {
       // Link to previous hour's energy state
       model.variables[`energy_state_${i-1}`][`state_tracking_${i}`] = -1;
    }

    // 3. Rate limits: charge <= max_charge, discharge <= max_discharge[cite: 7]
    model.constraints[`max_charge_${i}`] = { max: maxChargeRate };
    model.variables[charge][`max_charge_${i}`] = 1;

    model.constraints[`max_discharge_${i}`] = { max: maxDischargeRate };
    model.variables[discharge][`max_discharge_${i}`] = 1;

    // 4. Battery limits: min reserve <= energy <= capacity[cite: 7]
    model.constraints[`capacity_${i}`] = { max: capacity, min: 0 };
    model.variables[energyState][`capacity_${i}`] = 1;

    // Link the final hour to the end-of-day neutrality constraint
    if (i === 23) {
       model.variables[energyState]['end_of_day_energy'] = 1;
    }
  }

  // Apply LLM directives to constraints[cite: 7]
  directives.forEach(directive => {
    if (!directive.applies || !directive.structured_adjustment) return;
    
    const adj = directive.structured_adjustment;
    const targetHours = adj.hours || Array.from({length: 24}, (_, i) => i);

    targetHours.forEach(h => {
      if (directive.directive_type === "no_charge_window") {
        model.constraints[`max_charge_${h}`].max = 0; // Force 0 charge[cite: 7]
      } else if (directive.directive_type === "no_discharge_window") {
        model.constraints[`max_discharge_${h}`].max = 0;
      } else if (directive.directive_type === "minimum_battery_reserve" && adj.reserve_kwh) {
        model.constraints[`capacity_${h}`].min = adj.reserve_kwh;
      } else if (directive.directive_type === "solar_reduction" && adj.factor !== undefined) {
        // Adjust the energy balance constraint for reduced solar output
        const demand = scenarioData.demand_kwh[h];
        const reducedSolar = scenarioData.solar_forecast_kwh[h] * adj.factor;
        model.constraints[`balance_${h}`].equal = demand - reducedSolar;
      }
    });
  });

  return solver.Solve(model);
}

module.exports = { optimizeSchedule };
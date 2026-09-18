require('dotenv').config();
const express = require('express');
const { interpretNotes } = require('./llm.js');
const { validateDirectives } = require('./schema.js');
const { optimizeSchedule } = require('./solver.js');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post('/optimize-energy', async (req, res) => {
  try {
    // 1. EXTRACT NEW OFFICIAL SCHEMA
    const { scenario_id, operator_notes, hours, battery: rawBattery } = req.body;

    // 2. TRANSLATE TO YOUR EXISTING SOLVER FORMAT
    const grid_rates_bdt = hours.map(h => h.tariff_bdt_per_kwh);
    const demand_kwh = hours.map(h => h.demand_kwh);
    const solar_forecast_kwh = hours.map(h => h.solar_kwh);

    const battery = {
      capacity_kwh: rawBattery.capacity_kwh,
      initial_energy_kwh: rawBattery.initial_energy_kwh,
      max_charge_kw: rawBattery.max_charge_kwh_per_hour,     
      max_discharge_kw: rawBattery.max_discharge_kwh_per_hour 
    };

    // Rebuild the scenario object exactly how your solver.js expects it
    const adaptedScenario = {
      scenario_id,
      operator_notes,
      grid_rates_bdt,
      demand_kwh,
      solar_forecast_kwh,
      battery
    };
    
    // 3. LLM Extraction
    let rawDirectives;
    try {
      rawDirectives = await interpretNotes(operator_notes);
    } catch (llmErr) {
      console.warn("LLM network failure, using empty directives.");
      rawDirectives = [];
    }

    // 4. Deterministic Validation with Fallback
    let validatedDirectives;
    try {
      validatedDirectives = validateDirectives(rawDirectives);
    } catch (valErr) {
      console.warn("AI returned bad JSON shape. Falling back to safe defaults.");
      validatedDirectives = (operator_notes || []).map((note, idx) => ({
        note_index: idx,
        applies: false,
        directive_type: "no_op",
        structured_adjustment: null,
        explanation: "Fallback due to AI parse error"
      }));
    }
    
    // 5. Mathematical Optimization (Using adapted payload)
    const schedule = optimizeSchedule(adaptedScenario, validatedDirectives);
    
    if (!schedule.feasible) {
      return res.status(400).json({ error: "No feasible schedule could be calculated." });
    }

    // 6. FORMAT OUTPUT TO NEW OFFICIAL SCHEMA
    const final_hourly_plan = [];
    let total_grid_kwh = 0;
    let peak_grid_kwh = 0;

    for (let i = 0; i < 24; i++) {
      const gridImport = schedule[`grid_import_${i}`] || 0;
      const charge = schedule[`charge_${i}`] || 0;
      const discharge = schedule[`discharge_${i}`] || 0;
      const soc = schedule[`energy_state_${i}`] || 0;

      total_grid_kwh += gridImport;
      if (gridImport > peak_grid_kwh) peak_grid_kwh = gridImport;

      let action = "idle";
      let kwh = 0;
      if (charge > 0) {
        action = "charge";
        kwh = charge;
      } else if (discharge > 0) {
        action = "discharge";
        kwh = discharge;
      }

      // Calculate solar used based on GridWise energy balance rules
      let solar_used = demand_kwh[i] + charge - gridImport - discharge;

      final_hourly_plan.push({
        hour: i,
        grid_kwh: gridImport,
        solar_used_kwh: Math.max(0, solar_used),
        battery_action: action,
        battery_kwh: kwh,
        battery_energy_after_kwh: soc
      });
    }

    res.status(200).json({
      scenario_id: scenario_id,
      directive_interpretation: validatedDirectives,
      hourly_plan: final_hourly_plan,
      total_grid_kwh: total_grid_kwh,
      total_cost_bdt: schedule.result || 0,
      peak_grid_kwh: peak_grid_kwh,
      plan_summary: "Optimal 24-hour plan generated successfully."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal processing error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Listening on ${PORT}`));
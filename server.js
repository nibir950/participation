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
    const scenario = req.body;
    
    // 1. LLM Extraction
    let rawDirectives;
    try {
      rawDirectives = await interpretNotes(scenario.operator_notes);
    } catch (llmErr) {
      console.warn("LLM network failure, using empty directives.");
      rawDirectives = [];
    }

    // 2. Deterministic Validation with Fallback
    let validatedDirectives;
    try {
      validatedDirectives = validateDirectives(rawDirectives);
    } catch (valErr) {
      console.warn("AI returned bad JSON shape. Falling back to safe defaults.");
      // If the AI hallucinates, provide safe no-op data so the math solver can still run
      validatedDirectives = (scenario.operator_notes || []).map((note, idx) => ({
        note_index: idx,
        applies: false,
        directive_type: "no_op",
        structured_adjustment: null,
        explanation: "Fallback due to AI parse error"
      }));
    }
    
    // 3. Mathematical Optimization
    const schedule = optimizeSchedule(scenario, validatedDirectives);
    
    if (!schedule.feasible) {
      return res.status(400).json({ error: "No feasible schedule could be calculated." });
    }

    // 4. Format Output Schema
    const hourly_plan = [];
    let total_grid_kwh = 0;
    let peak_grid_kwh = 0;

    for (let i = 0; i < 24; i++) {
      const gridImport = schedule[`grid_import_${i}`] || 0;
      const charge = schedule[`charge_${i}`] || 0;
      const discharge = schedule[`discharge_${i}`] || 0;
      const soc = schedule[`energy_state_${i}`] || 0;

      total_grid_kwh += gridImport;
      if (gridImport > peak_grid_kwh) peak_grid_kwh = gridImport;

      hourly_plan.push({
        hour: i,
        grid_import_kwh: gridImport,
        battery_charge_kwh: charge,
        battery_discharge_kwh: discharge,
        battery_soc_kwh: soc
      });
    }

    res.status(200).json({
      scenario_id: scenario.scenario_id,
      directive_interpretation: validatedDirectives,
      hourly_plan: hourly_plan,
      total_grid_kwh: total_grid_kwh,
      total_cost_bdt: schedule.result || 0,
      peak_grid_kwh: peak_grid_kwh,
      plan_summary: "Optimal 24-hour plan generated successfully."
    });

  } catch (error) {
    res.status(500).json({ error: "Internal processing error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Listening on ${PORT}`));
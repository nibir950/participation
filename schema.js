const { z } = require('zod');

// Define exactly what the LLM is allowed to return for adjustments
const structuredAdjustmentSchema = z.object({
  factor: z.number().min(0).max(1).optional(), // For solar_reduction
  hours: z.array(z.number().int().min(0).max(23)).optional(), // For time windows
  reserve_kwh: z.number().min(0).optional(), // For minimum_battery_reserve
  max_kwh: z.number().min(0).optional() // For max_grid_window
}).nullable().optional();

const directiveSchema = z.object({
  note_index: z.number().int().min(0).max(2),
  applies: z.boolean(),
  directive_type: z.enum([
    "solar_reduction", "minimum_battery_reserve", 
    "no_charge_window", "no_discharge_window", 
    "max_grid_window", "no_op"
  ]),
  structured_adjustment: structuredAdjustmentSchema,
  explanation: z.string()
});

// Export both the schema and a validation helper function
module.exports = {
  validateDirectives: (data) => z.array(directiveSchema).parse(data)
};
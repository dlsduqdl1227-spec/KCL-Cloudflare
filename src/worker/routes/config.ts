import { AppContext } from "../db/d1";

export async function getConfig(ctx: AppContext) {
  const rows = await ctx.env.DB.prepare(
    `SELECT c.*, o.option_json
       FROM competitions c
       LEFT JOIN competition_options o ON o.competition_id = c.id AND o.option_key = 'default'
      ORDER BY c.id`
  ).all<any>();
  return {
    success: true,
    configs: (rows.results || []).map((row) => ({
      rowIndex: row.id,
      code: row.code,
      name: row.name,
      isActive: !!row.is_active,
      currentRound: row.current_round || "",
      sheetName: row.legacy_sheet_name || row.code,
      debriefing: !!row.debriefing_enabled,
      smsPrefix: row.sms_prefix || "",
      optionSettings: safeParseJson(row.option_json, {})
    }))
  };
}

function safeParseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

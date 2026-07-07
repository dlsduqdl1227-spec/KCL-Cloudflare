import { AppContext } from "../db/d1";
import { generateCuppingComment, generateIkrcComment, generateKbcComment, generateKcacComment, generateMobComment } from "./comments";
import { getConfig } from "./config";
import { createDebriefPdfFromPayload, sendOTP, verifyOTP } from "./debriefing";
import {
  cleanupCompetitionSheetTabs,
  deleteOperatorAccount,
  getAdminConsoleData,
  getIkrcCalibrationCupNumbers,
  getIkrcCalibrationResultsByCup,
  getIkrcSeedToCupConsole,
  getMobCalibrationParticipantNumbers,
  getMobCalibrationResultsByParticipant,
  markIkrcCalibrationChecked,
  markMobCalibrationChecked,
  saveIkrcSeedToCupMatch,
  updateCompetitionAdminSettings,
  updateIkrcSeedToCupResult,
  upsertOperatorAccount
} from "./export";
import { judgeLogin } from "./auth";
import { getParticipantAssignments } from "./participants";
import { createRankingDetailPdf, getRanking, getRankingDetail } from "./rankings";
import { deleteReviewRow, getReviewList, updateReviewRow, updateReviewStatus, updateReviewStatusBatch } from "./reviews";
import { submitScores, submitWithSignature } from "./scores";
import { json } from "../utils/response";

type RpcHandler = (ctx: AppContext, ...args: any[]) => Promise<any> | any;

export const rpcHandlers: Record<string, RpcHandler> = {
  getParticipantAssignments,
  judgeLogin,
  updateCompetitionAdminSettings,
  upsertOperatorAccount,
  deleteOperatorAccount,
  cleanupCompetitionSheetTabs,
  getAdminConsoleData,
  getConfig,
  getReviewList,
  updateReviewStatusBatch,
  updateReviewStatus,
  updateReviewRow,
  deleteReviewRow,
  getRanking,
  getRankingDetail,
  createRankingDetailPdf,
  generateCuppingComment: (_ctx, ...args) => generateCuppingComment(args[0]),
  generateKbcComment: (_ctx, ...args) => generateKbcComment(args[0]),
  generateKcacComment: (_ctx, ...args) => generateKcacComment(args[0]),
  generateMobComment: (_ctx, ...args) => generateMobComment(args[0]),
  generateIkrcComment: (_ctx, ...args) => generateIkrcComment(args[0]),
  submitScores,
  submitWithSignature,
  getMobCalibrationParticipantNumbers,
  markMobCalibrationChecked,
  getMobCalibrationResultsByParticipant,
  getIkrcSeedToCupConsole,
  saveIkrcSeedToCupMatch,
  updateIkrcSeedToCupResult,
  getIkrcCalibrationCupNumbers,
  markIkrcCalibrationChecked,
  getIkrcCalibrationResultsByCup,
  sendOTP,
  verifyOTP,
  createDebriefPdfFromPayload
};

export async function handleRpc(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return json({ success: false, message: "POST만 허용됩니다." }, { status: 405 });
  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ success: false, message: "JSON body를 읽을 수 없습니다." }, { status: 400 });
  }
  const fn = String(body && body.fn || "");
  const args = Array.isArray(body && body.args) ? body.args : [];
  const handler = rpcHandlers[fn];
  if (!handler) return json({ success: false, message: `허용되지 않은 RPC 함수입니다: ${fn}` }, { status: 403 });
  try {
    const result = await handler(ctx, ...args);
    return json(result);
  } catch (e: any) {
    return json({ success: false, message: e && e.message ? e.message : String(e) }, { status: 500 });
  }
}

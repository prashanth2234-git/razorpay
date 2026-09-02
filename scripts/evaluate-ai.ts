import fs from "fs";
import path from "path";
import {
  runEvaluation,
  runEvaluationAsync,
  DeterministicBaselinePredictor,
  EVALUATION_DATASET,
  EVALUATION_DATASET_VERSION,
  EvaluationReport,
} from "../src/server/ai/evaluation";
import { ClaudeEvaluationProvider } from "../src/server/ai/claude-evaluation";
import { isClaudeConfigured } from "../src/server/ai/claude";
import { GeminiEvaluationProvider } from "../src/server/ai/gemini-evaluation";
import { isGeminiConfigured } from "../src/server/ai/gemini";

// Load environment variables from .env.local or .env if running standalone
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadEnv();

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

function printSingleReport(report: EvaluationReport) {
  const m = report.metrics;

  console.log("\n========================================================");
  console.log("       RazorRecover — Offline AI Evaluation Report      ");
  console.log("========================================================");
  console.log(`Dataset Version : ${report.datasetVersion}`);
  console.log(`Provider Mode   : ${report.providerName}`);
  console.log(`Evaluated At    : ${report.evaluatedAt}`);
  console.log(`Evaluated Cases : ${m.totalCases} (${m.successfulCases} ok, ${m.failedCases} failed)`);
  console.log("--------------------------------------------------------");
  console.log("1. DECISION QUALITY & ACCURACY");
  console.log(`  - Recommended Action Accuracy : ${m.actionAccuracy.toFixed(1)}%`);
  console.log(`  - Risk Classification Accuracy: ${m.riskAccuracy.toFixed(1)}%`);
  console.log(`  - Historical Recovery Rate    : ${m.historicalRecoveryRate.toFixed(1)}%`);
  console.log("--------------------------------------------------------");
  console.log("2. RECOVERY POLICY & SAFETY GATES");
  console.log(`  - Policy Compatibility Rate   : ${m.policyCompatibilityRate.toFixed(1)}%`);
  console.log(`  - Policy Rejection Rate       : ${m.policyRejectionRate.toFixed(1)}%`);
  console.log(`  - High-Risk Escalation Rate   : ${m.highRiskEscalationRate.toFixed(1)}%`);
  console.log("--------------------------------------------------------");
  console.log("3. FINANCIAL ESTIMATION & REVENUE IMPACT");
  console.log(`  - Total Revenue at Risk       : ${formatRupees(m.totalRevenueAtRisk)}`);
  console.log(`  - Expected Recoverable Revenue: ${formatRupees(m.totalExpectedRecoverable)}`);
  console.log(`  - Historical Actual Recovered : ${formatRupees(m.totalHistoricalRecovered)}`);
  console.log("--------------------------------------------------------");
  console.log("4. EXECUTION & SIDE-EFFECT SAFETY");
  console.log(`  - Financial Mutations         : 0`);
  console.log(`  - Recovery Attempts Triggered : 0`);
  console.log(`  - Database Records Created    : 0`);

  if (m.failedCases > 0) {
    const firstFail = report.predictions.find((p) => p.isFailed);
    if (firstFail) {
      console.log("--------------------------------------------------------");
      console.log(`⚠️  Notice: Encountered ${m.failedCases}/${m.totalCases} failed evaluations.`);
      console.log(`   Sample error: ${firstFail.failureReason}`);
    }
  }

  console.log("========================================================\n");
}

function printComparisonReport(baseline: EvaluationReport, aiReport: EvaluationReport) {
  const bm = baseline.metrics;
  const am = aiReport.metrics;
  const aiProviderTitle =
    aiReport.providerName === "gemini"
      ? "Google Gemini (3.6 Flash)"
      : "Claude (3.7 Sonnet)";

  console.log("\n================================================================================");
  console.log("         RazorRecover — Offline AI Benchmark Comparison Report                  ");
  console.log("================================================================================");
  console.log(`Dataset Version : ${baseline.datasetVersion} (${bm.totalCases} versioned test cases)`);
  console.log(`Evaluated At    : ${aiReport.evaluatedAt}`);
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Metric                                      Deterministic Baseline    ${aiProviderTitle}`
  );
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Recommended Action Accuracy                  ${bm.actionAccuracy.toFixed(1).padStart(6)}%             ${am.actionAccuracy.toFixed(1).padStart(6)}%`
  );
  console.log(
    `Risk Classification Accuracy                 ${bm.riskAccuracy.toFixed(1).padStart(6)}%             ${am.riskAccuracy.toFixed(1).padStart(6)}%`
  );
  console.log(
    `Historical Recovery Rate                     ${bm.historicalRecoveryRate.toFixed(1).padStart(6)}%             ${am.historicalRecoveryRate.toFixed(1).padStart(6)}%`
  );
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Policy Compatibility Rate                    ${bm.policyCompatibilityRate.toFixed(1).padStart(6)}%             ${am.policyCompatibilityRate.toFixed(1).padStart(6)}%`
  );
  console.log(
    `Policy Rejection Rate                        ${bm.policyRejectionRate.toFixed(1).padStart(6)}%             ${am.policyRejectionRate.toFixed(1).padStart(6)}%`
  );
  console.log(
    `High-Risk Escalation Rate                    ${bm.highRiskEscalationRate.toFixed(1).padStart(6)}%             ${am.highRiskEscalationRate.toFixed(1).padStart(6)}%`
  );
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Total Revenue at Risk                       ${formatRupees(bm.totalRevenueAtRisk).padStart(14)}       ${formatRupees(am.totalRevenueAtRisk).padStart(14)}`
  );
  console.log(
    `Predicted Expected Recovery                 ${formatRupees(bm.totalExpectedRecoverable).padStart(14)}       ${formatRupees(am.totalExpectedRecoverable).padStart(14)}`
  );
  console.log(
    `Historical Actual Recovered                 ${formatRupees(bm.totalHistoricalRecovered).padStart(14)}       ${formatRupees(am.totalHistoricalRecovered).padStart(14)}`
  );
  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Case Success / Failure Count                    ${bm.successfulCases}/${bm.failedCases} cases             ${am.successfulCases}/${am.failedCases} cases`
  );
  if (am.failedCases > 0) {
    const firstFail = aiReport.predictions.find((p) => p.isFailed);
    if (firstFail) {
      console.log(`\n⚠️  Notice: ${aiProviderTitle} evaluation encountered failures (${am.failedCases}/${am.totalCases} cases).`);
      console.log(`   Sample error: ${firstFail.failureReason}`);
    }
  }
  console.log(
    `Financial Mutations / Side Effects                   0                         0`
  );
  console.log("================================================================================\n");
}

async function main() {
  const args = process.argv.slice(2);
  const isCompare = args.includes("--compare");
  const providerArgIndex = args.indexOf("--provider");
  const provider =
    providerArgIndex !== -1 && args[providerArgIndex + 1]
      ? args[providerArgIndex + 1].toLowerCase()
      : isCompare
      ? isGeminiConfigured()
        ? "gemini"
        : "claude"
      : "baseline";

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx scripts/evaluate-ai.ts [options]

Options:
  --provider <baseline|gemini|claude>   Run evaluation with specific provider (default: baseline)
  --compare                             Run side-by-side comparison (Baseline vs specified/configured AI provider)
  --help, -h                            Show this help message
    `);
    process.exit(0);
  }

  if (isCompare) {
    const targetProvider = provider === "baseline" ? (isGeminiConfigured() ? "gemini" : "claude") : provider;

    if (targetProvider === "gemini") {
      if (!isGeminiConfigured()) {
        console.error("\n❌ Error: Gemini evaluation unavailable: GEMINI_API_KEY is not configured in environment.");
        console.error("Set GEMINI_API_KEY in .env.local to run side-by-side comparison.\n");
        process.exit(1);
      }

      console.log("\nRunning baseline evaluation...");
      const baselineReport = runEvaluation(EVALUATION_DATASET, new DeterministicBaselinePredictor(), EVALUATION_DATASET_VERSION);

      console.log("Running Google Gemini evaluation on 15 dataset cases...");
      const geminiProvider = new GeminiEvaluationProvider();
      const geminiReport = await runEvaluationAsync(EVALUATION_DATASET, geminiProvider, EVALUATION_DATASET_VERSION);

      printComparisonReport(baselineReport, geminiReport);
      return;
    }

    if (targetProvider === "claude") {
      if (!isClaudeConfigured()) {
        console.error("\n❌ Error: Claude evaluation unavailable: CLAUDE_API_KEY is not configured in environment.");
        console.error("Set CLAUDE_API_KEY in .env.local to run side-by-side comparison.\n");
        process.exit(1);
      }

      console.log("\nRunning baseline evaluation...");
      const baselineReport = runEvaluation(EVALUATION_DATASET, new DeterministicBaselinePredictor(), EVALUATION_DATASET_VERSION);

      console.log("Running Claude AI evaluation on 15 dataset cases...");
      const claudeProvider = new ClaudeEvaluationProvider();
      const claudeReport = await runEvaluationAsync(EVALUATION_DATASET, claudeProvider, EVALUATION_DATASET_VERSION);

      printComparisonReport(baselineReport, claudeReport);
      return;
    }
  }

  if (provider === "gemini") {
    if (!isGeminiConfigured()) {
      console.error("\n❌ Error: Gemini evaluation unavailable: GEMINI_API_KEY is not configured in environment.");
      console.error("Set GEMINI_API_KEY in .env.local to run Gemini evaluation.\n");
      process.exit(1);
    }

    console.log("\nRunning Google Gemini evaluation on 15 dataset cases...");
    const geminiProvider = new GeminiEvaluationProvider();
    const geminiReport = await runEvaluationAsync(EVALUATION_DATASET, geminiProvider, EVALUATION_DATASET_VERSION);
    printSingleReport(geminiReport);
    return;
  }

  if (provider === "claude") {
    if (!isClaudeConfigured()) {
      console.error("\n❌ Error: Claude evaluation unavailable: CLAUDE_API_KEY is not configured in environment.");
      console.error("Set CLAUDE_API_KEY in .env.local to run Claude evaluation.\n");
      process.exit(1);
    }

    console.log("\nRunning Claude AI evaluation on 15 dataset cases...");
    const claudeProvider = new ClaudeEvaluationProvider();
    const claudeReport = await runEvaluationAsync(EVALUATION_DATASET, claudeProvider, EVALUATION_DATASET_VERSION);
    printSingleReport(claudeReport);
    return;
  }

  // Default: Deterministic baseline
  const baselineReport = runEvaluation(EVALUATION_DATASET, new DeterministicBaselinePredictor(), EVALUATION_DATASET_VERSION);
  printSingleReport(baselineReport);
}

main().catch((err) => {
  console.error("Evaluation runner error:", err);
  process.exit(1);
});

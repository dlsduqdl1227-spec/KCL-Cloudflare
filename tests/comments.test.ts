import { describe, expect, it } from "vitest";
import { generateCuppingComment, generateKbcComment } from "../src/worker/domain/comments/generateComment";

describe("comments", () => {
  it("returns deterministic comments for identical input", () => {
    const input = { flavor: 4.2, aftertaste: 3.8, acidity: 4, body: 3.6, sweetness: 4.4, overall: 4, tags: { flavor: ["citrus"], sweetness: ["honey"] } };
    expect(generateCuppingComment(input)).toEqual(generateCuppingComment(input));
  });

  it("does not call GPT/OpenAI APIs", () => {
    const text = generateKbcComment({ presentationVal: 4, espressoVals: [4, 4, 4, 4], machineVal: 4, totalScore: 25 }).comments.join("\n");
    expect(text).not.toMatch(/openai|gpt/i);
  });

  it("reflects smart tags", () => {
    const res = generateKbcComment({
      presentationVal: 4,
      espressoVals: [4, 4, 4, 4],
      machineVal: 4,
      totalScore: 25,
      tags: { espresso: ["클린", "보완 필요"] }
    });
    expect(res.comments.join(" ")).toContain("클린");
    expect(res.comments.join(" ")).toContain("보완");
  });
});

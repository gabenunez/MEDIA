import { describe, expect, it } from "vitest";
import { saveSubtitleOneAtATime } from "./subtitle-save-queue.js";

describe("saveSubtitleOneAtATime", () => {
  it("finishes one subtitle save before starting the next", async () => {
    const order: string[] = [];

    const first = saveSubtitleOneAtATime(async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first-end");
    });
    const second = saveSubtitleOneAtATime(async () => {
      order.push("second-start");
      order.push("second-end");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});

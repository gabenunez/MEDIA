import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WatchChaptersPanel } from "./watch-chapters";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

it("focuses the active web chapter and supports keyboard movement and selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("main");
  document.body.append(container);
  const root = createRoot(container);
  const chapters = [
    { startMs: 0, title: "Opening" },
    { startMs: 17_500, title: "Under the trees" },
    { startMs: 38_500, title: "Heading home" },
  ];
  const onSelect = vi.fn();
  try {
    await act(async () => root.render(createElement(WatchChaptersPanel, {
      chapters,
      activeIndex: 1,
      onSelect,
      onClose: vi.fn(),
      lookupCue: () => null,
      spriteUrl: null,
    })));
    expect(document.activeElement?.textContent).toContain("Under the trees");
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown", bubbles: true, cancelable: true,
      }));
    });
    expect(document.activeElement?.textContent).toContain("Heading home");
    await act(async () => (document.activeElement as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledWith(chapters[2]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

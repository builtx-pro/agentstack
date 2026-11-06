// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { useLoadMore } from "./use-load-more.hook";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("automatic page continuation", () => {
  it("does not drain pages when bounded rows leave the sentinel visible", () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const load = vi.fn();
    function Probe({ enabled }: { enabled: boolean }) {
      const ref = useLoadMore(enabled, load);
      return createElement("div", { ref });
    }
    const view = render(createElement(Probe, { enabled: true }));
    act(() => notify([{ isIntersecting: true }]));
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(createElement(Probe, { enabled: false }));
    view.rerender(createElement(Probe, { enabled: true }));
    act(() => notify([{ isIntersecting: true }]));
    expect(load).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => notify([{ isIntersecting: false }]));
    act(() => notify([{ isIntersecting: true }]));
    expect(load).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
it("observes a sentinel mounted by filters or retry after an initially empty result", () => {
  let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const observe = vi.fn(),
    load = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe = observe;
      disconnect = vi.fn();
    },
  );
  function Probe({ visible }: { visible: boolean }) {
    const ref = useLoadMore(true, load);
    return visible ? createElement("div", { ref }) : null;
  }
  const view = render(createElement(Probe, { visible: false }));
  expect(observe).not.toHaveBeenCalled();
  view.rerender(createElement(Probe, { visible: true }));
  act(() => notify([{ isIntersecting: true }]));
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(createElement(Probe, { visible: false }));
  view.rerender(createElement(Probe, { visible: true }));
  act(() => notify([{ isIntersecting: true }]));
  expect(load).toHaveBeenCalledTimes(2);
});

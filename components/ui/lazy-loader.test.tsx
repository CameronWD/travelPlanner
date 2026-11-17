import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { createLazyDialog, usePreloadWhenIdle } from "./lazy-loader";
import { toast } from "@/components/ui/use-toast";
import { OFFLINE_MESSAGE } from "@/components/ui/failure-message";

interface SheetProps {
  label: string;
  onOpenChange: (open: boolean) => void;
}

function Sheet({ label }: SheetProps) {
  return <div data-testid="sheet">{label}</div>;
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div data-testid="boundary" /> : this.props.children;
  }
}

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
const setConnection = (connection: { saveData?: boolean; effectiveType?: string } | undefined) =>
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });

let idle: Array<() => void>;
const cancelIdle = vi.fn();

beforeEach(() => {
  vi.mocked(toast).mockClear();
  cancelIdle.mockClear();
  setOnline(true);
  setConnection(undefined);
  idle = [];
  const win = window as unknown as Record<string, unknown>;
  win.requestIdleCallback = (cb: () => void) => idle.push(cb);
  win.cancelIdleCallback = cancelIdle;
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  delete win.requestIdleCallback;
  delete win.cancelIdleCallback;
});

describe("createLazyDialog", () => {
  it("renders the dialog once its module has loaded, with the props it was given", async () => {
    const load = vi.fn(async () => Sheet);
    const LazySheet = createLazyDialog<SheetProps>(load, (props) => props.onOpenChange(false));
    const onOpenChange = vi.fn();
    render(<LazySheet label="Paris" onOpenChange={onOpenChange} />);
    expect(await screen.findByTestId("sheet")).toHaveTextContent("Paris");
    expect(load).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not ask for the module until it is rendered", () => {
    const load = vi.fn(async () => Sheet);
    createLazyDialog<SheetProps>(load, (props) => props.onOpenChange(false));
    expect(load).not.toHaveBeenCalled();
  });

  it("a module that cannot load offline closes the dialog and shows the offline message, not the error boundary", async () => {
    setOnline(false);
    const LazySheet = createLazyDialog<SheetProps>(() => Promise.reject(new Error("ChunkLoadError")), (props) => props.onOpenChange(false));
    const onOpenChange = vi.fn();
    const { container } = render(
      <Boundary>
        <LazySheet label="Paris" onOpenChange={onOpenChange} />
      </Boundary>,
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: OFFLINE_MESSAGE });
    expect(screen.queryByTestId("boundary")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("says it could not open when the module fails with a connection", async () => {
    const LazySheet = createLazyDialog<SheetProps>(() => Promise.reject(new Error("ChunkLoadError")), (props) => props.onOpenChange(false));
    render(<LazySheet label="Paris" onOpenChange={vi.fn()} />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't open that. Try again." }));
  });

  it("asks for the module again the next time the dialog opens", async () => {
    let online = false;
    const load = vi.fn(async () => {
      if (!online) throw new Error("ChunkLoadError");
      return Sheet;
    });
    const LazySheet = createLazyDialog<SheetProps>(load, (props) => props.onOpenChange(false));
    const onOpenChange = vi.fn();
    const first = render(<LazySheet label="a" onOpenChange={onOpenChange} />);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    first.unmount();

    online = true;
    render(<LazySheet label="b" onOpenChange={onOpenChange} />);
    expect(await screen.findByTestId("sheet")).toHaveTextContent("b");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("usePreloadWhenIdle", () => {
  function makeDialogs() {
    const loads = [vi.fn(async () => Sheet), vi.fn(async () => Sheet)];
    const dialogs = loads.map((load) => createLazyDialog<SheetProps>(load, (props) => props.onOpenChange(false)));
    function Page() {
      usePreloadWhenIdle(dialogs);
      return <div data-testid="page" />;
    }
    return { loads, Page };
  }

  const runIdle = () => act(async () => { for (const cb of idle.splice(0)) cb(); });

  it("asks for every module once, at idle, without rendering a dialog", async () => {
    const { loads, Page } = makeDialogs();
    const { rerender } = render(<Page />);
    for (const load of loads) expect(load).not.toHaveBeenCalled();
    expect(idle).toHaveLength(1);

    await runIdle();
    for (const load of loads) expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sheet")).toBeNull();

    rerender(<Page />);
    expect(idle).toHaveLength(0);
    for (const load of loads) expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the page mounts a second time", async () => {
    const { loads, Page } = makeDialogs();
    const first = render(<Page />);
    await runIdle();
    first.unmount();
    render(<Page />);
    await runIdle();
    for (const load of loads) expect(load).toHaveBeenCalledTimes(1);
  });

  it("asks again on the next mount for a module that failed to preload, and does not throw", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("ChunkLoadError")).mockResolvedValue(Sheet);
    const dialogs = [createLazyDialog<SheetProps>(load, (props) => props.onOpenChange(false))];
    function Page() {
      usePreloadWhenIdle(dialogs);
      return null;
    }
    const first = render(<Page />);
    await runIdle();
    first.unmount();
    render(<Page />);
    await runIdle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it("does nothing on a connection that asks to save data", async () => {
    setConnection({ saveData: true });
    const { loads, Page } = makeDialogs();
    render(<Page />);
    await runIdle();
    for (const load of loads) expect(load).not.toHaveBeenCalled();
  });

  it("does nothing on 2G", async () => {
    setConnection({ effectiveType: "2g" });
    const { loads, Page } = makeDialogs();
    render(<Page />);
    await runIdle();
    for (const load of loads) expect(load).not.toHaveBeenCalled();
  });

  it("does nothing offline", async () => {
    setOnline(false);
    const { loads, Page } = makeDialogs();
    render(<Page />);
    await runIdle();
    for (const load of loads) expect(load).not.toHaveBeenCalled();
  });

  it("is cancelled when the page unmounts before the browser is idle", () => {
    const { Page } = makeDialogs();
    render(<Page />).unmount();
    expect(cancelIdle).toHaveBeenCalledTimes(1);
  });

  it("waits on a timer where there is no idle callback", async () => {
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    vi.useFakeTimers();
    try {
      const { loads, Page } = makeDialogs();
      render(<Page />);
      expect(loads[0]).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(1500); });
      for (const load of loads) expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

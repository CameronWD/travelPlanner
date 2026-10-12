import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectedApp } from "@/server/actions/connected-apps";

const { disconnectAppMock } = vi.hoisted(() => ({
  disconnectAppMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/connected-apps", () => ({ disconnectApp: disconnectAppMock }));

import { ConnectedAppsPanel } from "@/components/account/connected-apps-panel";

const NOW = new Date("2026-10-12T10:00:00.000Z");

const app = (over: Partial<ConnectedApp> = {}): ConnectedApp => ({
  id: "consent-1",
  clientName: "Claude",
  returnsTo: "claude.ai",
  connectedAt: "2026-10-12T01:00:00.000Z",
  lastUsedAt: "2026-10-12T08:00:00.000Z",
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  disconnectAppMock.mockResolvedValue({ success: true });
});

describe("ConnectedAppsPanel", () => {
  it("says how to connect when nothing is connected", () => {
    render(<ConnectedAppsPanel initial={[]} now={NOW} />);
    expect(screen.getByText("Nothing is connected yet.")).toBeInTheDocument();
    expect(screen.getByText("Add Teepee in your Claude app and sign in to connect it.")).toBeInTheDocument();
  });

  it("names each app, where it returns to, when it was connected and when it was last used", () => {
    render(<ConnectedAppsPanel initial={[app()]} now={NOW} />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText(/Returns to claude\.ai/)).toBeInTheDocument();
    expect(screen.getByText(/Connected 12 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/Last used 2h ago/)).toBeInTheDocument();
  });

  it("says an app that has not called yet is not used yet", () => {
    render(<ConnectedAppsPanel initial={[app({ lastUsedAt: null })]} now={NOW} />);
    expect(screen.getByText(/Not used yet/)).toBeInTheDocument();
  });

  it("names an unnamed app by where it returns to", () => {
    render(<ConnectedAppsPanel initial={[app({ clientName: "An app", returnsTo: "localhost:53712" })]} now={NOW} />);
    expect(screen.getByText("An app")).toBeInTheDocument();
    expect(screen.getByText(/Returns to localhost:53712/)).toBeInTheDocument();
  });

  it("asks before disconnecting, inline, and does nothing on Keep", async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    const user = userEvent.setup();
    render(<ConnectedAppsPanel initial={[app()]} now={NOW} />);

    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(screen.getByText(/Claude will stop working with your trips until you connect it again\./)).toBeInTheDocument();
    expect(disconnectAppMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(disconnectAppMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Disconnect Claude" })).toBeInTheDocument();
  });

  it("disconnects on confirm and drops the row", async () => {
    const user = userEvent.setup();
    render(<ConnectedAppsPanel initial={[app(), app({ id: "consent-2", clientName: "Claude Code", returnsTo: "localhost:53712" })]} now={NOW} />);

    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));

    await waitFor(() => expect(disconnectAppMock).toHaveBeenCalledWith("consent-1"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Disconnect Claude" })).not.toBeInTheDocument());
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Disconnected. Claude has to ask again before it can use your trips.");
  });

  it("keeps the row and says so when the disconnect fails", async () => {
    disconnectAppMock.mockResolvedValueOnce({ success: false, errors: { _: ["Couldn't disconnect that app. Try again."] } });
    const user = userEvent.setup();
    render(<ConnectedAppsPanel initial={[app()]} now={NOW} />);

    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't disconnect that app. Try again.");
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("keeps the row and says so when the action throws", async () => {
    disconnectAppMock.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ConnectedAppsPanel initial={[app()]} now={NOW} />);

    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't disconnect that app. Try again.");
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });
});

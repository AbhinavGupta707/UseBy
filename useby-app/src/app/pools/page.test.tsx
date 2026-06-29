import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DemandPoolsPage from "./page";

describe("DemandPoolsPage", () => {
  it("renders the premium pools surface", () => {
    render(<DemandPoolsPage />);

    expect(screen.getByRole("heading", { name: "Community pools" })).toBeInTheDocument();
    expect(screen.getByText(/Unlock better local prices together/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ending soonest" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading live pool")).toBeInTheDocument();
  });
});

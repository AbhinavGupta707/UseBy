import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DemandPoolsPage from "./page";

describe("DemandPoolsPage", () => {
  it("renders the DemandPool shell and navigation", () => {
    render(<DemandPoolsPage />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Neighbourhood group buys" })).toBeInTheDocument();
    expect(screen.getByText(/does not capture deposits, cards, or payments/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grocery" })).toHaveAttribute("href", "/grocery");
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/bookings");
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StoreDropsPage from "./page";

describe("StoreDropsPage", () => {
  it("renders the surplus drops shell and navigation", () => {
    render(<StoreDropsPage />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reserve nearby surplus pickups" })).toBeInTheDocument();
    expect(screen.getByText(/does not capture cards, deposits, or charges/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grocery" })).toHaveAttribute("href", "/grocery");
    expect(screen.getByRole("link", { name: "Pools" })).toHaveAttribute("href", "/pools");
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });
});

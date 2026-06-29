import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StoreDropsPage from "./page";

describe("StoreDropsPage", () => {
  it("renders the premium drops surface", () => {
    render(<StoreDropsPage />);

    expect(screen.getByRole("heading", { name: "Merchant drops" })).toBeInTheDocument();
    expect(screen.getByText(/unpaid reservation intent/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Weekend brunch bundle" })).toBeInTheDocument();
  });
});

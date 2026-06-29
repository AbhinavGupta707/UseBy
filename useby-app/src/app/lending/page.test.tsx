import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LendingPage from "./page";

describe("LendingPage", () => {
  it("renders the premium lending surface", () => {
    render(<LendingPage />);

    expect(screen.getByRole("heading", { name: "Wardrobe and household lending" })).toBeInTheDocument();
    expect(screen.getByText(/keep exact household details private/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Wardrobe" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Household" })).toBeInTheDocument();
  });
});

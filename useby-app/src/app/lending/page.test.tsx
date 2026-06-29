import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LendingPage from "./page";

describe("LendingPage", () => {
  it("renders the lending shell and navigation", () => {
    render(<LendingPage />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wardrobe rental and household lending" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grocery" })).toHaveAttribute("href", "/grocery");
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/bookings");
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the premium Today dashboard", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Good evening, Maya" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nearby opportunities" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /List item/i })).toHaveAttribute("href", "/lending");
    expect(screen.getByRole("link", { name: /View all matches/i })).toHaveAttribute("href", "/grocery#matches");
  });
});

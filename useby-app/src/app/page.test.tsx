import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the UseBy product and proof entry screen", () => {
    render(<Home />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Turn household inventory into local actions." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Judge-facing live evidence" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });
});

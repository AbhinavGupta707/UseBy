import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the UseBy grocery shelf and proof links", () => {
    render(<Home />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grocery inventory and neighbour actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live backend signals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grocery" })).toHaveAttribute("href", "/grocery");
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
  });
});

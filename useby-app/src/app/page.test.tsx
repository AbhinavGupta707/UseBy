import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the UseBy operations shell", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "UseBy" })).toBeInTheDocument();
    expect(screen.getByText("Aurora PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint 1 Ready")).toBeInTheDocument();
  });
});


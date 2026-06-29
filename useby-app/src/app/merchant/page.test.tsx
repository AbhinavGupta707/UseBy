import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MerchantPage from "./page";

describe("MerchantPage", () => {
  it("renders the merchant portal shell and navigation", () => {
    render(<MerchantPage />);

    expect(screen.getByText("UseBy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DemandPool bidding and pickup queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grocery" })).toHaveAttribute("href", "/grocery");
    expect(screen.getByRole("link", { name: "Proof" })).toHaveAttribute("href", "/proof");
    expect(screen.getByText("Payment deferred")).toBeInTheDocument();
  });
});

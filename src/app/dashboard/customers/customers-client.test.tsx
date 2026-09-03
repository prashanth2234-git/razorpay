import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { CustomersClient } from "./customers-client";
import { CustomersResponse } from "@/types/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("CustomersClient Component", () => {
  const mockCustomerData: CustomersResponse = {
    total: 2,
    page: 1,
    pageSize: 15,
    totalPages: 1,
    customers: [
      {
        id: "cust_01",
        merchantId: "merch_123",
        name: "Rahul Verma",
        email: "rahul@example.com",
        phone: "+919876543210",
        lifetimeValue: 1250000, // ₹12,500
        successfulPaymentCount: 5,
        failedPaymentCount: 0,
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-20T10:00:00Z",
      },
      {
        id: "cust_02",
        merchantId: "merch_123",
        name: "Pooja Sharma",
        email: "pooja@example.com",
        phone: "+919876543211",
        lifetimeValue: 450000, // ₹4,500
        successfulPaymentCount: 2,
        failedPaymentCount: 1,
        createdAt: "2026-08-05T10:00:00Z",
        updatedAt: "2026-08-22T10:00:00Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders customer directory table with correct customer names and emails", () => {
    render(<CustomersClient initialData={mockCustomerData} />);

    expect(screen.getByText("Customer Directory")).toBeDefined();
    expect(screen.getByText("Rahul Verma")).toBeDefined();
    expect(screen.getByText("rahul@example.com")).toBeDefined();
    expect(screen.getByText("Pooja Sharma")).toBeDefined();
    expect(screen.getByText("pooja@example.com")).toBeDefined();
  });

  it("formats lifetime values in INR correctly", () => {
    render(<CustomersClient initialData={mockCustomerData} />);

    expect(screen.getByText("₹12,500")).toBeDefined();
    expect(screen.getByText("₹4,500")).toBeDefined();
  });

  it("displays payment health status badges accurately", () => {
    render(<CustomersClient initialData={mockCustomerData} />);

    expect(screen.getByText("Healthy")).toBeDefined();
    expect(screen.getByText("Attention Needed")).toBeDefined();
  });

  it("updates search input state upon user typing", () => {
    render(<CustomersClient initialData={mockCustomerData} />);

    const searchInput = screen.getByPlaceholderText("Search by name, email, or phone…") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Rahul" } });

    expect(searchInput.value).toBe("Rahul");
  });
});

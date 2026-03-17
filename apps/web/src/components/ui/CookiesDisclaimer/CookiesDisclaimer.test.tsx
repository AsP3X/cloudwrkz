/**
 * Unit tests for CookiesDisclaimer component
 *
 * Note: This test file requires testing dependencies to be installed:
 * - @testing-library/react
 * - @testing-library/jest-dom
 * - @testing-library/user-event
 * - jest or vitest
 * - jest-environment-jsdom or vitest with jsdom
 *
 * Install with: pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
 * For Jest: pnpm add -D jest jest-environment-jsdom @types/jest
 * For Vitest: pnpm add -D vitest @vitest/ui jsdom
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CookiesDisclaimer } from "./CookiesDisclaimer";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("CookiesDisclaimer", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
    // Reset any mocks
    jest.clearAllMocks();
  });

  it("should render the cookies disclaimer on first visit", async () => {
    render(<CookiesDisclaimer />);

    await waitFor(() => {
      expect(
        screen.getByText(/We use cookies to enhance your browsing experience/i)
      ).toBeInTheDocument();
    });
  });

  it("should not render if user has already accepted cookies", () => {
    // Set localStorage to indicate cookies have been accepted
    localStorageMock.setItem("cookie-consent-accepted", JSON.stringify(true));

    const { container } = render(<CookiesDisclaimer />);

    expect(container.firstChild).toBeNull();
  });

  it("should display custom message when provided", async () => {
    const customMessage = "Custom cookie message";
    render(<CookiesDisclaimer message={customMessage} />);

    await waitFor(() => {
      expect(screen.getByText(customMessage)).toBeInTheDocument();
    });
  });

  it("should display custom accept button text when provided", async () => {
    const customButtonText = "I Agree";
    render(<CookiesDisclaimer acceptButtonText={customButtonText} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: customButtonText })).toBeInTheDocument();
    });
  });

  it("should display privacy policy link when provided", async () => {
    const privacyLink = "/privacy-policy";
    render(<CookiesDisclaimer privacyPolicyLink={privacyLink} />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /Learn more/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", privacyLink);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("should hide disclaimer when accept button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<CookiesDisclaimer />);

    await waitFor(() => {
      expect(
        screen.getByText(/We use cookies to enhance your browsing experience/i)
      ).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", { name: /Accept/i });
    await user.click(acceptButton);

    await waitFor(
      () => {
        expect(container.firstChild).toBeNull();
      },
      { timeout: 1000 }
    );
  });

  it("should save acceptance to localStorage when accept button is clicked", async () => {
    const user = userEvent.setup();
    render(<CookiesDisclaimer />);

    await waitFor(() => {
      expect(
        screen.getByText(/We use cookies to enhance your browsing experience/i)
      ).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", { name: /Accept/i });
    await user.click(acceptButton);

    await waitFor(() => {
      const stored = localStorageMock.getItem("cookie-consent-accepted");
      expect(stored).toBe(JSON.stringify(true));
    });
  });

  it("should call onAccept callback when provided and accept button is clicked", async () => {
    const user = userEvent.setup();
    const onAcceptMock = jest.fn();
    render(<CookiesDisclaimer onAccept={onAcceptMock} />);

    await waitFor(() => {
      expect(
        screen.getByText(/We use cookies to enhance your browsing experience/i)
      ).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", { name: /Accept/i });
    await user.click(acceptButton);

    await waitFor(() => {
      expect(onAcceptMock).toHaveBeenCalledTimes(1);
    });
  });

  it("should have proper accessibility attributes", async () => {
    render(<CookiesDisclaimer />);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: /Cookie consent/i });
      expect(dialog).toHaveAttribute("aria-label", "Cookie consent");
      expect(dialog).toHaveAttribute("aria-live", "polite");
    });
  });
});


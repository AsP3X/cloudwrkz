// Human: First-run wizard to create the initial admin account (Aurora-style onboarding for CloudWrkz).
// Agent: TWO-STEP local state; CALLS completeSetup; WRITES auth_token; CALLS useAuth completeSetupSession; NAVIGATES dashboard.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { completeSetup } from "@/api/setup";
import { useAuth } from "@/components/providers/AuthProvider";
import { ApiError } from "@/api/client";

type Step = 1 | 2;

export default function SetupPage() {
  const navigate = useNavigate();
  const { completeSetupSession } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [instanceName, setInstanceName] = useState(APP_CONFIG.name);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Human: Step 1 validates account fields before advancing the wizard.
  // Agent: RETURNS error string or null; CHECKS email shape + password length + match.
  function validateStep1(): string | null {
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Invalid email address";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  function validateStep2(): string | null {
    if (!instanceName.trim()) return "Instance name is required";
    return null;
  }

  const next = () => {
    setError("");
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setStep(2);
  };

  const back = () => {
    setError("");
    setStep(1);
  };

  // Human: Final step posts setup payload and signs the admin in immediately when the API returns a token.
  // Agent: CALLS completeSetup; CALLS completeSetupSession(token); NAVIGATE ROUTES.DASHBOARD replace.
  async function handleSubmit() {
    setError("");
    const err = validateStep2();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    try {
      const res = await completeSetup({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        instance_name: instanceName.trim(),
      });
      if (!res.token) {
        setError("Setup did not return a session token.");
        return;
      }
      await completeSetupSession(res.token);
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Setup failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <MouseSpotlightSurface
      variant="content"
      className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
    >
      {/* Human: Full-height flex column centers the wizard; MouseSpotlightSurface's inner shell is full width so centering belongs here. */}
      {/* Agent: container mx-auto; flex min-h-screen items-center justify-center; child max-w-md w-full. */}
      <div className="container mx-auto flex min-h-screen w-full flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent mb-2">
            {APP_CONFIG.name}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            First-time setup — create your administrator account
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white/95 p-8 shadow-soft-xl ring-1 ring-neutral-900/[0.04] backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/[0.06]">
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    s === step
                      ? "bg-primary-600 text-white"
                      : s < step
                        ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500"
                  }`}
                >
                  {s}
                </div>
                {s < 2 && (
                  <div
                    className={`w-10 h-0.5 rounded-full ${
                      s < step ? "bg-primary-400" : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Admin account
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  This user will have full administrator access.
                </p>
              </div>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Display name (optional)"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <Button type="button" className="w-full" onClick={next}>
                Continue
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Instance
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Shown in admin settings and health metadata.
                </p>
              </div>
              <Input
                label="Instance name"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                required
              />
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={back} disabled={loading}>
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating…" : "Finish setup"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </MouseSpotlightSurface>
  );
}

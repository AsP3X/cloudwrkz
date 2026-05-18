// Human: First-run setup API helpers used by the `/setup` wizard and SetupGuard.
// Agent: CALLS GET /setup/status and POST /setup via api client; NO auth required.

import { api } from "@/api/client";

export interface SetupStatusResponse {
  setup_complete: boolean;
}

export interface SetupRequestBody {
  email: string;
  password: string;
  name?: string;
  instance_name?: string;
}

export interface SetupResponse {
  token: string;
  user: {
    name: string | null;
    email: string;
  };
}

export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  return api.get<SetupStatusResponse>("/setup/status", { cache: "no-store" });
}

export async function completeSetup(body: SetupRequestBody): Promise<SetupResponse> {
  return api.post<SetupResponse>("/setup", body);
}

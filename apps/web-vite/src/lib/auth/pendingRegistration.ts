const REG_JOB_STORAGE_KEY = "cw_reg_job_id";

export function getStoredRegisterJobId(): string | null {
  try {
    return sessionStorage.getItem(REG_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRegisterJobId(jobId: string): void {
  try {
    sessionStorage.setItem(REG_JOB_STORAGE_KEY, jobId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredRegisterJobId(): void {
  try {
    sessionStorage.removeItem(REG_JOB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

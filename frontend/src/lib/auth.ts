export type AuthUser = {
  username: string;
};

/** Demo credentials (validated by backend). Never store tokens in localStorage. */
export const DEMO_CREDENTIALS = {
  username: "admin",
  password: "admin123",
} as const;

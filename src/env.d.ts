import type { AdminIdentity } from "./lib/auth/access";

declare global {
  namespace App {
    interface Locals {
      admin?: AdminIdentity;
    }
  }

  namespace Cloudflare {
    interface Env {
      ACCESS_TEAM_DOMAIN?: string;
      ACCESS_AUD?: string;
      ADMIN_EMAIL?: string;
      LOCAL_ADMIN_EMAIL?: string;
    }
  }
}

export {};

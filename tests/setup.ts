import { config } from "dotenv";

// Always load the isolated test environment, overriding anything inherited.
config({ path: ".env.test", override: true });

if (process.env.APP_ENV !== "test" || !/omw_test|_test\b|test/i.test(new URL(process.env.DATABASE_URL!).pathname)) {
  throw new Error("Refusing to run tests outside the isolated test database");
}

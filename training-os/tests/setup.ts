import { config } from "dotenv";

// Les tests utilisent TOUJOURS la base de test (.env.test), jamais celle de développement
config({ path: ".env.test", override: true });
process.env.APP_ENV ??= "test";

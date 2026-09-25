/** Exécute les tâches quotidiennes hors HTTP (cron système / conteneur). */
import "dotenv/config";
import { closeDb } from "../src/db/client";
import { runDailyJobs } from "../src/server/jobs";

runDailyJobs()
  .then(async (r) => {
    console.log(JSON.stringify(r, null, 2));
    await closeDb();
  })
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });

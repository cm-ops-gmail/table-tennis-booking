import "dotenv/config";
import { createApp } from "./api/_lib/app.js";

const port = Number(process.env.PORT) || 3001;
createApp().listen(port, () => {
  console.log(`\n  Table Tennis Booking API  →  http://localhost:${port}/api/health\n`);
});

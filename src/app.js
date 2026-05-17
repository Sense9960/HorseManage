import express from "express";
import userRoute from "./routes/user.route.js";
const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
// ===== END MIDDLEWARE =====

// ===== ROUTES =====

// ===== END ROUTES =====
app.use("/users", userRoute);

export default app;

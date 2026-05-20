import express from "express";
import swaggerUi from "swagger-ui-express";

import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import jockeyRoutes from "./routes/jockeyRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
// ===== END MIDDLEWARE =====

// ===== API DOCS =====
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// ===== END API DOCS =====

// ===== ROUTES =====
app.get("/health", (req, res) =>
    res.send({ status: "Success", message: "HorseManage API is running" })
);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/jockey", jockeyRoutes);
app.use("/api/enduser", endUserRoutes);
// ===== END ROUTES =====

app.use((req, res) => {
    res.status(404).send({ status: "Error", message: "Không tìm thấy endpoint" });
});

export default app;

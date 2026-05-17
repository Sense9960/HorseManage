import express from "express";

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
// ===== END MIDDLEWARE =====

// ===== ROUTES =====
app.get("/", (request, response) => {
    response.send("Hello World");
});

app.post("/", (request, response) => {
    response.status(201).send({ status: "Success" });
});

app.put("/:id", (request, response) => {
    response.status(200).send({ status: "Success" });
});

app.delete("/:id", (request, response) => {
    response.status(200).send({ status: "Success" });
});
// ===== END ROUTES =====

export default app;

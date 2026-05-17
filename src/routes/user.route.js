import express from 'express';
import userModel from '../models/user.model';
const router = express (); 



// ===== MIDDLEWARE =====
router.use(express.json());
// ===== END MIDDLEWARE =====

// ===== ROUTES =====
router.get("/", (request, response) => {
    response.send("Hello World");
});

router.post("/", async(request, response) => {
    const { name, email, password } = request.body;
   try {
     const user = await userModel.create({ name, email, password });
     response.status(201).send({ 
         status: "Success",
         message: "User created successfully",
         
      });
      user.save();
   } catch (error) {
     response.status(500).send({
         status: "Error",
         message: "Failed to create user",
            error: error.message
     });
   }
});

router.put("/:id", (request, response) => {
    response.status(200).send({ status: "Success" });
});

router.delete("/:id", (request, response) => {
    response.status(200).send({ status: "Success" });
});



export default router;
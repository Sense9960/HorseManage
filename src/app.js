import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import { authenticate, authorize } from './middleware/auth.js';
import { ROLES } from './models/User.js';

dotenv.config();

const app = express();
app.use(express.json());

if (process.env.MONGODB_URL) {
    mongoose
        .connect(process.env.MONGODB_URL)
        .then(() => console.log('Kết nối thành công đến MongoDB'))
        .catch((err) => console.error('Lỗi kết nối đến MongoDB:', err));
}

app.get('/', (req, res) => {
    res.send({ status: 'Success', message: 'HorseManage API is running' });
});

app.use('/api/auth', authRoutes);

app.get('/api/admin/ping', authenticate, authorize(ROLES.ADMIN), (req, res) => {
    res.send({ status: 'Success', message: 'Hello Admin' });
});

app.get('/api/jockey/ping', authenticate, authorize(ROLES.JOCKEY), (req, res) => {
    res.send({ status: 'Success', message: 'Hello Jockey' });
});

app.get('/api/owner/ping', authenticate, authorize(ROLES.OWNER_HORSE), (req, res) => {
    res.send({ status: 'Success', message: 'Hello OwnerHorse' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;

import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required. Set it in .env before starting the server.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const signToken = (user) =>
    jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const authenticate = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            return res.status(401).send({ status: 'Error', message: 'Token không tồn tại' });
        }
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user || user.status !== 'Active') {
            return res.status(401).send({ status: 'Error', message: 'Tài khoản không hợp lệ' });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).send({ status: 'Error', message: 'Token không hợp lệ' });
    }
};

export const authorize = (...allowedRoles) => (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).send({ status: 'Error', message: 'Không có quyền truy cập' });
    }
    next();
};

import { User, Admin, Jockey, OwnerHorse, EndUser, ROLES } from '../models/User.js';
import { signToken } from '../middleware/auth.js';

const modelByRole = {
    [ROLES.ADMIN]: Admin,
    [ROLES.JOCKEY]: Jockey,
    [ROLES.OWNER_HORSE]: OwnerHorse,
    [ROLES.END_USER]: EndUser,
};

const sanitize = (user) => {
    const obj = user.toObject();
    delete obj.password;
    return obj;
};

export const register = async (req, res) => {
    try {
        const { username, email, password, fullName, role, ...rest } = req.body;

        if (!username || !email || !password || !fullName) {
            return res.status(400).send({
                status: 'Error',
                message: 'username, email, password, fullName là bắt buộc',
            });
        }

        const selectedRole = role || ROLES.END_USER;
        const Model = modelByRole[selectedRole];
        if (!Model) {
            return res.status(400).send({
                status: 'Error',
                message: `Role không hợp lệ. Hợp lệ: ${Object.values(ROLES).join(', ')}`,
            });
        }

        const existed = await User.findOne({ $or: [{ email }, { username }] });
        if (existed) {
            return res.status(409).send({
                status: 'Error',
                message: 'Email hoặc username đã tồn tại',
            });
        }

        const user = await Model.create({ username, email, password, fullName, ...rest });
        const token = signToken(user);

        return res.status(201).send({
            status: 'Success',
            message: 'Đăng ký thành công',
            data: { user: sanitize(user), token },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const login = async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;
        if (!emailOrUsername || !password) {
            return res.status(400).send({
                status: 'Error',
                message: 'emailOrUsername và password là bắt buộc',
            });
        }

        const user = await User.findOne({
            $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
        }).select('+password');

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).send({
                status: 'Error',
                message: 'Sai thông tin đăng nhập',
            });
        }

        if (user.status !== 'Active') {
            return res.status(403).send({
                status: 'Error',
                message: `Tài khoản đang ở trạng thái ${user.status}`,
            });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = signToken(user);
        return res.status(200).send({
            status: 'Success',
            message: 'Đăng nhập thành công',
            data: { user: sanitize(user), token },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const me = async (req, res) => {
    return res.status(200).send({
        status: 'Success',
        message: 'Thông tin tài khoản',
        data: req.user,
    });
};

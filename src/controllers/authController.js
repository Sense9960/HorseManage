import { OAuth2Client } from 'google-auth-library';
import { User, Admin, Jockey, OwnerHorse, EndUser, ROLES } from '../models/User.js';
import { signToken } from '../middlewares/auth.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

        // Thưởng 500 điểm chào mừng cho EndUser khi đăng ký tài khoản mới.
        const signupBonus = selectedRole === ROLES.END_USER
            ? Number(process.env.SIGNUP_BONUS_POINTS) || 500
            : 0;

        const user = await Model.create({
            username, email, password, fullName,
            ...(signupBonus > 0 && { points: signupBonus }),
            ...rest,
        });
        const token = signToken(user);

        return res.status(201).send({
            status: 'Success',
            message: signupBonus > 0
                ? `Đăng ký thành công — bạn nhận được ${signupBonus} điểm chào mừng!`
                : 'Đăng ký thành công',
            data: { user: sanitize(user), token, signupBonus },
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

export const googleLogin = async (req, res) => {
    try {
        const { idToken, role } = req.body;
        if (!idToken) {
            return res.status(400).send({ status: 'Error', message: 'idToken là bắt buộc' });
        }
        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).send({ status: 'Error', message: 'Server chưa cấu hình GOOGLE_CLIENT_ID' });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture, email_verified } = payload;

        if (!email_verified) {
            return res.status(401).send({ status: 'Error', message: 'Email Google chưa được xác minh' });
        }

        let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });
        let created = false;

        if (!user) {
            const selectedRole = role && Object.values(ROLES).includes(role) ? role : ROLES.END_USER;
            const Model = modelByRole[selectedRole];
            let username = email.split('@')[0];
            if (await User.findOne({ username })) {
                username = `${username}_${googleId.slice(-6)}`;
            }
            user = await Model.create({
                username,
                email: email.toLowerCase(),
                fullName: name || email,
                avatar: picture || '',
                googleId,
                authProvider: 'google',
                isVerified: true,
            });
            created = true;
        } else if (!user.googleId) {
            user.googleId = googleId;
            user.authProvider = user.authProvider || 'google';
            if (!user.avatar && picture) user.avatar = picture;
            user.isVerified = true;
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
        return res.status(created ? 201 : 200).send({
            status: 'Success',
            message: created ? 'Đăng ký Google thành công' : 'Đăng nhập Google thành công',
            data: {
                user: sanitize(user),
                token,
                google: { name, email, picture },
            },
        });
    } catch (err) {
        return res.status(401).send({ status: 'Error', message: `Google token không hợp lệ: ${err.message}` });
    }
};

export const me = async (req, res) => {
    return res.status(200).send({
        status: 'Success',
        message: 'Thông tin tài khoản',
        data: req.user,
    });
};

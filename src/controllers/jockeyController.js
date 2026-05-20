import Horse from '../models/Horse.js';

const EDITABLE_FIELDS = [
    'fullName', 'phone', 'avatar', 'dateOfBirth', 'gender', 'address',
    'experienceYears', 'weightKg', 'heightCm',
];

export const getProfile = async (req, res) => {
    return res.status(200).send({
        status: 'Success',
        message: 'Hồ sơ Jockey',
        data: req.user,
    });
};

export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) user[f] = req.body[f];
        }
        await user.save();
        return res.status(200).send({
            status: 'Success',
            message: 'Cập nhật hồ sơ thành công',
            data: user,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyHorses = async (req, res) => {
    try {
        const horses = await Horse.find({ currentJockey: req.user._id }).sort({ createdAt: -1 });
        return res.status(200).send({
            status: 'Success',
            message: 'Danh sách ngựa bạn đang cưỡi',
            data: horses,
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
